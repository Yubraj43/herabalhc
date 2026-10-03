from django.urls import path

from .views import AdminOrderStatusView, CancelOrderView, CheckoutView, OrderDetailView, OrderListView

urlpatterns = [
    path("", OrderListView.as_view(), name="order-list"),
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("<int:pk>/", OrderDetailView.as_view(), name="order-detail"),
    path("<int:pk>/cancel/", CancelOrderView.as_view(), name="order-cancel"),
    path("<int:pk>/status/", AdminOrderStatusView.as_view(), name="admin-order-status"),
]
