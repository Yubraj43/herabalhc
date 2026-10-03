from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from products.models import Product
from .models import Cart, CartItem
from .serializers import CartItemSerializer


def cart_payload(cart, request):
    items = list(cart.items.select_related("product").all())
    subtotal = sum((item.product.price * item.quantity for item in items), start=0)
    return {"items": CartItemSerializer(items, many=True, context={"request": request}).data, "item_count": sum(item.quantity for item in items), "subtotal": subtotal}


class CartView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        return Response(cart_payload(cart, request))


class CartItemCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        product_id = request.data.get("product_id")
        try:
            quantity = int(request.data.get("quantity", 1))
        except (TypeError, ValueError):
            return Response({"quantity": ["Enter a whole number."]}, status=status.HTTP_400_BAD_REQUEST)
        if quantity < 1:
            return Response({"quantity": ["Quantity must be at least 1."]}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            product = get_object_or_404(Product.objects.select_for_update(), pk=product_id, is_active=True, category__is_active=True)
            cart, _ = Cart.objects.get_or_create(user=request.user)
            item = CartItem.objects.filter(cart=cart, product=product).first()
            new_quantity = quantity + (item.quantity if item else 0)
            if new_quantity > product.stock_quantity:
                return Response({"quantity": [f"Only {product.stock_quantity} in stock."]}, status=status.HTTP_400_BAD_REQUEST)
            if item is None:
                item = CartItem(cart=cart, product=product)
            item.quantity = new_quantity
            item.save()
        return Response(cart_payload(cart, request), status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            quantity = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return Response({"quantity": ["Enter a whole number."]}, status=status.HTTP_400_BAD_REQUEST)
        if quantity < 1:
            return Response({"quantity": ["Quantity must be at least 1."]}, status=status.HTTP_400_BAD_REQUEST)
        item = get_object_or_404(CartItem.objects.select_related("product", "cart"), pk=pk, cart__user=request.user)
        if quantity > item.product.stock_quantity:
            return Response({"quantity": [f"Only {item.product.stock_quantity} in stock."]}, status=status.HTTP_400_BAD_REQUEST)
        item.quantity = quantity
        item.save(update_fields=["quantity", "updated_at"])
        return Response(cart_payload(item.cart, request))

    def delete(self, request, pk):
        item = get_object_or_404(CartItem.objects.select_related("cart"), pk=pk, cart__user=request.user)
        cart = item.cart
        item.delete()
        return Response(cart_payload(cart, request))
