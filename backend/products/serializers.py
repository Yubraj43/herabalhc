from rest_framework import serializers

from categories.serializers import CategorySerializer
from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id", "name", "slug", "sku", "description", "image_url", "price",
            "compare_at_price", "stock_quantity", "is_featured", "category", "created_at",
        ]

    def get_image_url(self, product):
        if not product.image:
            return product.image_url
        url = product.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
