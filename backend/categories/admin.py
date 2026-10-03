from django.contrib import admin
from django.utils.html import format_html

from .models import Category


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "image_preview", "slug", "is_active", "updated_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "description"]
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ["image_preview", "created_at", "updated_at"]
    exclude = ["image_url"]

    @admin.display(description="Image")
    def image_preview(self, category):
        if not category.image:
            return "No image uploaded"
        return format_html('<img src="{}" alt="" style="max-height:72px;max-width:96px;object-fit:cover;border-radius:4px" />', category.image.url)
