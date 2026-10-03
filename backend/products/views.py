from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.filters import OrderingFilter, SearchFilter

from .models import Product
from .serializers import ProductSerializer


class ProductListView(ListAPIView):
    serializer_class = ProductSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "description", "sku", "category__name"]
    ordering_fields = ["price", "name", "created_at"]
    ordering = ["-is_featured", "name"]

    def get_queryset(self):
        queryset = Product.objects.filter(is_active=True, category__is_active=True).select_related("category")
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category__slug=category)
        if self.request.query_params.get("featured", "").lower() in {"1", "true", "yes"}:
            queryset = queryset.filter(is_featured=True)
        return queryset


class ProductDetailView(RetrieveAPIView):
    serializer_class = ProductSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return Product.objects.filter(is_active=True, category__is_active=True).select_related("category")
