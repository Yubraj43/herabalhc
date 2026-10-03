from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.text import slugify
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, PublicUserSerializer, RegistrationSerializer
from .models import GoogleIdentity

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": PublicUserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": PublicUserSerializer(user).data})


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        client_id = settings.GOOGLE_OAUTH_CLIENT_ID
        if not client_id:
            return Response({"detail": "Google sign-in is not configured yet."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        credential = request.data.get("credential")
        if not isinstance(credential, str) or not credential:
            return Response({"credential": ["A Google credential is required."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            claims = id_token.verify_oauth2_token(credential, GoogleRequest(), audience=client_id)
        except (ValueError, GoogleAuthError, OSError):
            return Response({"detail": "Google sign-in could not be verified. Please try again."}, status=status.HTTP_401_UNAUTHORIZED)

        subject = claims.get("sub")
        email = (claims.get("email") or "").strip().lower()
        if not subject or not email or claims.get("email_verified") is not True:
            return Response({"detail": "Google must provide a verified email address."}, status=status.HTTP_401_UNAUTHORIZED)

        with transaction.atomic():
            identity = GoogleIdentity.objects.select_related("user").filter(subject=subject).first()
            user = identity.user if identity else User.objects.select_for_update().filter(email__iexact=email).first()
            if user is None:
                base_username = slugify(email.split("@", 1)[0])[:140] or "google-user"
                username = base_username
                suffix = 2
                while User.objects.filter(username=username).exists():
                    username = f"{base_username[:140-len(str(suffix))]}-{suffix}"
                    suffix += 1
                user = User.objects.create_user(
                    username=username,
                    email=email,
                    first_name=(claims.get("given_name") or "")[:150],
                    last_name=(claims.get("family_name") or "")[:150],
                )
                user.set_unusable_password()
                user.save(update_fields=["password"])
            elif not user.is_active:
                return Response({"detail": "This account is inactive."}, status=status.HTTP_403_FORBIDDEN)
            if identity is None:
                if GoogleIdentity.objects.filter(user=user).exists():
                    return Response({"detail": "This account is linked to a different Google account."}, status=status.HTTP_409_CONFLICT)
                GoogleIdentity.objects.create(user=user, subject=subject)
            token, _ = Token.objects.get_or_create(user=user)

        return Response({"token": token.key, "user": PublicUserSerializer(user).data})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(PublicUserSerializer(request.user).data)
