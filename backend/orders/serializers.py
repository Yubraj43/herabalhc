from rest_framework import serializers

from .models import Order, OrderItem


class CheckoutSerializer(serializers.Serializer):
    customer_name = serializers.CharField(max_length=180)
    phone = serializers.CharField(max_length=32)
    email = serializers.EmailField(required=False, allow_blank=True)
    address_line1 = serializers.CharField(max_length=240)
    address_line2 = serializers.CharField(max_length=240, required=False, allow_blank=True)
    city = serializers.CharField(max_length=120)
    district = serializers.CharField(max_length=120, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=24, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "sku", "image_url", "unit_price", "quantity", "line_total"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "number", "status", "payment_method", "customer_name", "phone", "email",
            "address_line1", "address_line2", "city", "district", "postal_code", "notes",
            "subtotal", "total", "items", "created_at", "updated_at",
        ]
