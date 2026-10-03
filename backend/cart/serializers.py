from rest_framework import serializers

from .models import CartItem


class CartItemSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product.id", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_slug = serializers.CharField(source="product.slug", read_only=True)
    image_url = serializers.SerializerMethodField()
    price = serializers.DecimalField(source="product.price", max_digits=10, decimal_places=2, read_only=True)
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = CartItem
        fields = ["id", "product_id", "product_name", "product_slug", "image_url", "price", "quantity", "line_total"]

    def get_line_total(self, item):
        return item.product.price * item.quantity

    def get_image_url(self, item):
        if not item.product.image:
            return item.product.image_url
        url = item.product.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
