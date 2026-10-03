# Herbal Health Care

Herbal Health Care is a React/Vite storefront backed by Django REST Framework and PostgreSQL. It currently supports a product/category catalog, account registration, password and Google sign-in, guest and authenticated carts, cash-on-delivery orders, stock tracking, and Django Admin management.

## Run locally

Start PostgreSQL first. Set the database connection in `backend/.env` using the backend entries in the root `.env.example` as a guide. Keep credentials private.

In one PowerShell window, start the API:

```powershell
cd "C:\Users\mahat\Downloads\e commerce\ub-herbal\backend"
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

In another PowerShell window, start the storefront:

```powershell
cd "C:\Users\mahat\Downloads\e commerce\ub-herbal\frontend"
npm run dev
```

Open `http://127.0.0.1:5173`. The frontend API URL is configured by `VITE_API_URL` in `frontend/.env.local` and defaults to `http://127.0.0.1:8000/api/`.

Create the first staff/admin account with:

```powershell
cd "C:\Users\mahat\Downloads\e commerce\ub-herbal\backend"
.\.venv\Scripts\python.exe manage.py createsuperuser
```

Visit `http://127.0.0.1:8000/admin/` to create categories and products, upload image files, set prices and featured status, and manage inventory. Public product and category APIs are read-only; catalog management is restricted to Django Admin.

## Google sign-in setup

Create an OAuth **Web application** client ID in Google Cloud Console and add these authorized JavaScript origins: `http://localhost:5173` and `http://127.0.0.1:5173`. Put the same client ID into `GOOGLE_OAUTH_CLIENT_ID` in `backend/.env` and `VITE_GOOGLE_CLIENT_ID` in `frontend/.env.local`, then restart both servers. This Google Identity Services ID-token flow does not use a client secret. The backend verifies Google's signed token before creating or linking an account.

## API overview

- `GET /api/health/` and development-only `GET /api/health/db/`
- `GET /api/categories/`
- `GET /api/products/` (supports `category`, `search`, `featured`, ordering, and pagination)
- `GET /api/products/<slug>/`
- `POST /api/auth/register/`, `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `POST /api/auth/google/` (Google Identity Services ID token)
- `GET /api/cart/`, `POST /api/cart/items/`, `PATCH|DELETE /api/cart/items/<id>/`
- `POST /api/orders/checkout/` (cash on delivery), `GET /api/orders/`, `GET /api/orders/<id>/`, `POST /api/orders/<id>/cancel/`
- Staff order updates: `PATCH /api/orders/<id>/status/`

Authenticated endpoints use `Authorization: Token <token>`. The React client keeps the token in tab-scoped session storage. A guest cart is held locally and merged into the user's server cart at sign-in. Checkout validates stock and creates orders transactionally; pending/confirmed cancellation restores stock. COD is the only payment method and no payment gateway is connected.

Product and category images can be uploaded directly through Django Admin. In development, files are stored under `backend/media/` and served by Django only while `DEBUG` is enabled; uploads accept JPG, PNG, and WEBP up to 5 MB. Configure durable object storage or a media server before production. The development database health route is hidden when `DEBUG` is false and should be removed or protected before production. Set production secrets, HTTPS, secure authentication storage, rate limits, and a production WSGI/ASGI server before deployment.

The older Next.js source is preserved separately in `legacy-next/`; the active frontend is the Vite app in `frontend/`.
