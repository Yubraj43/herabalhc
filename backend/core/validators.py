from django.core.exceptions import ValidationError
from django.core.validators import FileExtensionValidator


validate_image_extension = FileExtensionValidator(["jpg", "jpeg", "png", "webp"])


def validate_image_size(image):
    if image.size > 5 * 1024 * 1024:
        raise ValidationError("Image files must be 5 MB or smaller.")
