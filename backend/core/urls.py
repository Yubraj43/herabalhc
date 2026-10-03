from django.urls import path

from .views import api_health, database_health


urlpatterns = [
    path("health/", api_health, name="api-health"),
    path("health/db/", database_health, name="database-health"),
]
