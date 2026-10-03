from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from cart.models import Cart
from products.models import Product
from .models import Order, OrderItem
from .serializers import CheckoutSerializer, OrderSerializer


class CheckoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            cart = get_object_or_404(Cart.objects.select_for_update(), user=request.user)
            cart_items = list(cart.items.select_related("product").order_by("product_id"))
            if not cart_items:
                return Response({"detail": "Your cart is empty."}, status=status.HTTP_400_BAD_REQUEST)

            locked_products = {}
            for cart_item in cart_items:
                product = Product.objects.select_for_update().get(pk=cart_item.product_id)
                if not product.is_active or not product.category.is_active:
                    return Response({"detail": f"{product.name} is no longer available."}, status=status.HTTP_400_BAD_REQUEST)
                if cart_item.quantity > product.stock_quantity:
                    return Response({"detail": f"Only {product.stock_quantity} of {product.name} remain in stock."}, status=status.HTTP_400_BAD_REQUEST)
                locked_products[product.pk] = product

            subtotal = sum(
                (locked_products[item.product_id].price * item.quantity for item in cart_items),
                start=Decimal("0.00"),
            )
            order = Order.objects.create(user=request.user, subtotal=subtotal, total=subtotal, **serializer.validated_data)
            order_items = []
            for cart_item in cart_items:
                product = locked_products[cart_item.product_id]
                order_items.append(OrderItem(
                    order=order,
                    product=product,
                    product_name=product.name,
                    sku=product.sku,
                    image_url=request.build_absolute_uri(product.image.url) if product.image else product.image_url,
                    unit_price=product.price,
                    quantity=cart_item.quantity,
                    line_total=product.price * cart_item.quantity,
                ))
                product.stock_quantity -= cart_item.quantity
                product.save(update_fields=["stock_quantity", "updated_at"])
            OrderItem.objects.bulk_create(order_items)
            cart.items.all().delete()
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user).prefetch_related("items")
        return Response(OrderSerializer(orders, many=True).data)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        order = get_object_or_404(Order.objects.prefetch_related("items"), pk=pk, user=request.user)
        return Response(OrderSerializer(order).data)


class CancelOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        with transaction.atomic():
            order = get_object_or_404(Order.objects.select_for_update(), pk=pk, user=request.user)
            if order.status != Order.Status.PENDING:
                return Response({"detail": "Only pending orders can be cancelled."}, status=status.HTTP_400_BAD_REQUEST)
            for item in order.items.select_related("product").all():
                if item.product_id:
                    Product.objects.filter(pk=item.product_id).update(stock_quantity=F("stock_quantity") + item.quantity)
            order.status = Order.Status.CANCELLED
            order.save(update_fields=["status", "updated_at"])
        return Response(OrderSerializer(order).data)


class AdminOrderStatusView(APIView):
    permission_classes = [IsAdminUser]
    transitions = {
        Order.Status.PENDING: {Order.Status.CONFIRMED, Order.Status.CANCELLED},
        Order.Status.CONFIRMED: {Order.Status.SHIPPED, Order.Status.CANCELLED},
        Order.Status.SHIPPED: {Order.Status.DELIVERED},
        Order.Status.DELIVERED: set(),
        Order.Status.CANCELLED: set(),
    }

    def patch(self, request, pk):
        next_status = request.data.get("status")
        if next_status not in self.transitions:
            return Response({"status": ["Choose a valid order status."]}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            order = get_object_or_404(Order.objects.select_for_update(), pk=pk)
            if next_status not in self.transitions[order.status]:
                return Response({"detail": f"Cannot change an order from {order.status} to {next_status}."}, status=status.HTTP_400_BAD_REQUEST)
            if next_status == Order.Status.CANCELLED:
                for item in order.items.all():
                    if item.product_id:
                        Product.objects.filter(pk=item.product_id).update(stock_quantity=F("stock_quantity") + item.quantity)
            order.status = next_status
            order.save(update_fields=["status", "updated_at"])
        return Response(OrderSerializer(order).data)
