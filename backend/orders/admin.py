from django.contrib import admin, messages
from django.db import transaction
from django.db.models import F

from products.models import Product
from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = ["product", "product_name", "sku", "image_url", "unit_price", "quantity", "line_total"]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["number", "customer_name", "user", "status", "payment_method", "total", "created_at"]
    list_filter = ["status", "payment_method", "created_at"]
    search_fields = ["number", "customer_name", "phone", "email", "user__username"]
    readonly_fields = [field.name for field in Order._meta.fields]
    inlines = [OrderItemInline]
    actions = ["mark_confirmed", "mark_shipped", "mark_delivered", "cancel_and_restore_stock"]

    @admin.action(description="Mark pending orders confirmed")
    def mark_confirmed(self, request, queryset):
        updated = queryset.filter(status=Order.Status.PENDING).update(status=Order.Status.CONFIRMED)
        self.message_user(request, f"Confirmed {updated} pending order(s).", messages.SUCCESS)

    @admin.action(description="Mark confirmed orders shipped")
    def mark_shipped(self, request, queryset):
        updated = queryset.filter(status=Order.Status.CONFIRMED).update(status=Order.Status.SHIPPED)
        self.message_user(request, f"Marked {updated} confirmed order(s) as shipped.", messages.SUCCESS)

    @admin.action(description="Mark shipped orders delivered")
    def mark_delivered(self, request, queryset):
        updated = queryset.filter(status=Order.Status.SHIPPED).update(status=Order.Status.DELIVERED)
        self.message_user(request, f"Marked {updated} shipped order(s) as delivered.", messages.SUCCESS)

    @admin.action(description="Cancel pending/confirmed orders and restore stock")
    def cancel_and_restore_stock(self, request, queryset):
        cancelled = 0
        with transaction.atomic():
            for order in queryset.select_for_update().filter(status__in=[Order.Status.PENDING, Order.Status.CONFIRMED]):
                for item in order.items.all():
                    if item.product_id:
                        Product.objects.filter(pk=item.product_id).update(stock_quantity=F("stock_quantity") + item.quantity)
                order.status = Order.Status.CANCELLED
                order.save(update_fields=["status", "updated_at"])
                cancelled += 1
        self.message_user(request, f"Cancelled {cancelled} order(s) and restored available products to stock.", messages.SUCCESS)
