from rest_framework import serializers

from .models import Category


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "description", "image_url", "product_count"]

    def get_image_url(self, category):
        if not category.image:
            return category.image_url
        url = category.image.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url
