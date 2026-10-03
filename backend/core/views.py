import logging

from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view


logger = logging.getLogger(__name__)


@api_view(["GET"])
def api_health(_request):
    return JsonResponse({"api": "ok"})


@api_view(["GET"])
def database_health(_request):
    """Development-only PostgreSQL connectivity check; never returns DB details."""
    if not settings.DEBUG:
        return JsonResponse({"error": "Not found"}, status=404)

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return JsonResponse({"database": "connected"})
    except Exception as error:
        # Driver exception text may contain host or database details.
        logger.error("Database health check failed (%s)", type(error).__name__)
        return JsonResponse(
            {"database": "disconnected", "error": "Database unavailable"},
            status=503,
        )
