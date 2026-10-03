from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "image_preview", "sku", "category", "price", "stock_quantity", "is_active", "is_featured"]
    list_filter = ["is_active", "is_featured", "category"]
    list_editable = ["price", "stock_quantity", "is_active", "is_featured"]
    search_fields = ["name", "sku", "description"]
    prepopulated_fields = {"slug": ("name",)}
    autocomplete_fields = ["category"]
    readonly_fields = ["image_preview", "created_at", "updated_at"]
    exclude = ["image_url"]

    def get_list_display(self, request):
        columns = super().get_list_display(request)
        if self.has_delete_permission(request):
            return (*columns, "delete_link")
        return columns

    @admin.display(description="Image")
    def image_preview(self, product):
        if not product.image:
            return "No image uploaded"
        return format_html('<img src="{}" alt="" style="max-height:72px;max-width:96px;object-fit:cover;border-radius:4px" />', product.image.url)

    @admin.display(description="Action")
    def delete_link(self, product):
        url = reverse("admin:products_product_delete", args=[product.pk])
        return format_html('<a class="button" href="{}">Delete</a>', url)
