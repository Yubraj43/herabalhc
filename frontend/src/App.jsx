import { useCallback, useEffect, useRef, useState } from 'react'
import client from './api/client.js'
import heroImage from './assets/hero-editorial.webp'
import botanicalImage from './assets/botanical-editorial.webp'
import './App.css'

const readSession = () => {
  try { return JSON.parse(sessionStorage.getItem('ub-herbal-user') || 'null') } catch { return null }
}
const rows = (data) => Array.isArray(data) ? data : (data?.results || [])
const money = (amount) => `NPR ${Number(amount || 0).toFixed(2)}`
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const readGuestCart = () => {
  try {
    const items = JSON.parse(localStorage.getItem('ub-herbal-guest-cart') || '[]')
    return { items, item_count: items.reduce((count, item) => count + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + Number(item.line_total), 0) }
  } catch { return { items: [], item_count: 0, subtotal: 0 } }
}
const buildCart = (items) => ({ items, item_count: items.reduce((count, item) => count + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + Number(item.line_total), 0) })

async function mergeGuestCart() {
  let serverCart = null
  let skipped = 0
  const guestItems = readGuestCart().items
  for (const item of guestItems) {
    try {
      const response = await client.post('cart/items/', { product_id: item.product_id, quantity: item.quantity })
      serverCart = response.data
    } catch { skipped += 1 }
  }
  localStorage.removeItem('ub-herbal-guest-cart')
  return { serverCart, skipped }
}

export default function App() {
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [catalogReload, setCatalogReload] = useState(0)
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [loading, setLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [user, setUser] = useState(readSession)
  const [cart, setCart] = useState(readGuestCart)
  const [modal, setModal] = useState('')
  const [notice, setNotice] = useState('')
  const [orders, setOrders] = useState([])
  const [continueToCheckout, setContinueToCheckout] = useState(false)

  useEffect(() => {
    let active = true
    const params = {}
    if (category) params.category = category
    if (search.trim()) params.search = search.trim()
    params.page = page
    Promise.all([client.get('categories/'), client.get('products/', { params })])
      .then(([categoryResponse, productResponse]) => {
        if (!active) return
        setCategories(rows(categoryResponse.data))
        setProducts(rows(productResponse.data))
        setPageCount(Math.max(1, Math.ceil((productResponse.data.count || 0) / 12)))
        setCatalogError('')
      })
      .catch(() => {
        if (active) setCatalogError('We couldn’t load the shop. Check that the Django server is running, then try again.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [category, search, page, catalogReload])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    client.get('cart/')
      .then((response) => { if (active) setCart(response.data) })
      .catch(() => { if (active) setNotice('Could not load your cart. Please sign in again.') })
    return () => { active = false }
  }, [user])

  async function addToCart(product) {
    if (!user) {
      const existing = cart.items.find((item) => item.product_id === product.id)
      const quantity = (existing?.quantity || 0) + 1
      if (quantity > product.stock_quantity) { setNotice(`Only ${product.stock_quantity} of ${product.name} remain in stock.`); return }
      const item = { id: product.id, product_id: product.id, product_name: product.name, product_slug: product.slug, image_url: product.image_url, price: product.price, quantity, line_total: Number(product.price) * quantity }
      const next = buildCart(existing ? cart.items.map((entry) => entry.product_id === product.id ? item : entry) : [...cart.items, item])
      localStorage.setItem('ub-herbal-guest-cart', JSON.stringify(next.items))
      setCart(next)
      setNotice(`${product.name} added to your cart.`)
      return
    }
    try {
      const response = await client.post('cart/items/', { product_id: product.id, quantity: 1 })
      setCart(response.data)
      setNotice(`${product.name} added to your cart.`)
    } catch (error) {
      setNotice(error.response?.data?.quantity?.[0] || error.response?.data?.detail || 'Could not add that item.')
    }
  }

  async function updateItem(item, quantity) {
    if (!user) {
      const next = buildCart(cart.items.flatMap((entry) => {
        if (entry.product_id !== item.product_id) return [entry]
        if (quantity < 1) return []
        return [{ ...entry, quantity, line_total: Number(entry.price) * quantity }]
      }))
      localStorage.setItem('ub-herbal-guest-cart', JSON.stringify(next.items))
      setCart(next)
      return
    }
    try {
      const response = quantity < 1
        ? await client.delete(`cart/items/${item.id}/`)
        : await client.patch(`cart/items/${item.id}/`, { quantity })
      setCart(response.data)
    } catch (error) { setNotice(error.response?.data?.quantity?.[0] || 'Could not update your cart.') }
  }

  async function signIn(payload, mode) {
    const endpoint = mode === 'register' ? 'auth/register/' : 'auth/login/'
    const response = await client.post(endpoint, payload)
    sessionStorage.setItem('ub-herbal-token', response.data.token)
    sessionStorage.setItem('ub-herbal-user', JSON.stringify(response.data.user))
    const { serverCart, skipped } = await mergeGuestCart()
    if (serverCart) setCart(serverCart)
    setUser(response.data.user)
    setModal(continueToCheckout ? 'checkout' : '')
    setContinueToCheckout(false)
    setNotice(`Welcome${response.data.user.first_name ? `, ${response.data.user.first_name}` : ''}.${skipped ? ` ${skipped} cart item(s) could not be moved because they are unavailable.` : ''}`)
  }

  const signInWithGoogle = useCallback(async (credential) => {
    const response = await client.post('auth/google/', { credential })
    sessionStorage.setItem('ub-herbal-token', response.data.token)
    sessionStorage.setItem('ub-herbal-user', JSON.stringify(response.data.user))
    const { serverCart, skipped } = await mergeGuestCart()
    if (serverCart) setCart(serverCart)
    setUser(response.data.user)
    setModal(continueToCheckout ? 'checkout' : '')
    setContinueToCheckout(false)
    setNotice(`Welcome${response.data.user.first_name ? `, ${response.data.user.first_name}` : ''}.${skipped ? ` ${skipped} cart item(s) could not be moved because they are unavailable.` : ''}`)
  }, [continueToCheckout])

  function startCheckout() {
    if (!user) {
      setContinueToCheckout(true)
      setModal('auth')
      return
    }
    setModal('checkout')
  }

  function closeAuth() {
    setModal('')
    setContinueToCheckout(false)
  }

  async function signOut() {
    try { await client.post('auth/logout/') } catch { /* The token may already have expired. */ }
    sessionStorage.removeItem('ub-herbal-token')
    sessionStorage.removeItem('ub-herbal-user')
    setUser(null)
    setCart(readGuestCart())
    setModal('')
    setNotice('You’re signed out.')
  }

  async function openAccount() {
    if (!user) { setModal('auth'); return }
    const [profileResult, ordersResult] = await Promise.allSettled([client.get('auth/me/'), client.get('orders/')])
    if (profileResult.status === 'fulfilled') {
      setUser(profileResult.value.data)
      sessionStorage.setItem('ub-herbal-user', JSON.stringify(profileResult.value.data))
    }
    setOrders(ordersResult.status === 'fulfilled' ? rows(ordersResult.value.data) : [])
    setModal('account')
  }

  async function cancelOrder(order) {
    if (!window.confirm(`Cancel order ${order.number}?`)) return
    try {
      const response = await client.post(`orders/${order.id}/cancel/`)
      setOrders((previous) => previous.map((item) => item.id === order.id ? response.data : item))
      setNotice(`Order ${order.number} was cancelled.`)
    } catch (error) {
      setNotice(error.response?.data?.detail || 'That order could not be cancelled.')
    }
  }

  async function checkout(payload) {
    const response = await client.post('orders/checkout/', payload)
    setCart({ items: [], item_count: 0, subtotal: 0 })
    setOrders((previous) => [response.data, ...previous])
    setModal('order-success')
    setNotice(`Order ${response.data.number} placed. Payment is due on delivery.`)
  }

  return (
    <div className="store">
      <div className="announcement">BOTANICAL WELLNESS, ROOTED IN NEPAL <span>·</span> NATURAL CARE FOR EVERY DAY</div>
      <header className="store-header">
        <a className="brand" href="#top" aria-label="Herbal Health Care home"><span className="brand-name">Herbal Health Care</span><small>BOTANICAL WELLNESS</small></a>
        <form className="search" onSubmit={(event) => { event.preventDefault(); setLoading(true); setCatalogError(''); setPage(1); if (searchInput.trim() === search) setCatalogReload((value) => value + 1); else setSearch(searchInput.trim()) }} role="search">
          <label className="sr-only" htmlFor="shop-search">Search products</label>
          <input id="shop-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search herbal care…" />
          <button type="submit" aria-label="Search">⌕</button>
        </form>
        <nav className="header-actions" aria-label="Account and cart">
          <button className="text-action" onClick={openAccount}>{user ? 'My account' : 'Sign in'}</button>
          <button className="cart-action" onClick={() => setModal('cart')} aria-label={`Open cart, ${cart.item_count} items`}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 8H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></svg><span>Cart</span><b>{cart.item_count || 0}</b></button>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true">✳</span> BOTANICAL CARE · ROOTED IN NEPAL</p>
            <h1>A softer<br /><em>everyday.</em></h1>
            <p>Thoughtful herbal essentials for the little rituals that make a day feel good.</p>
            <div className="hero-actions"><a className="primary-button" href="#shop">Explore the collection <span aria-hidden="true">↗</span></a><span className="hero-note">A little more nature, every day.</span></div>
          </div>
          <div className="hero-image"><img src={heroImage} alt="Amber herbal care bottles arranged with fresh leaves and botanicals" /><span className="image-caption"><i aria-hidden="true" /> A slower kind of self-care</span></div>
          <div className="hero-stamp" aria-hidden="true">ROOTED<br />IN NATURE<br /><span>✳</span></div>
        </section>

        <section className="promise-row" aria-label="Our values">
          <span><i>✳</i> Plant-powered care</span><span><i>⌁</i> Made with intention</span><span><i>↗</i> Delivered across Nepal</span>
        </section>

        <section className="shop-section" id="shop">
          <div className="section-heading"><div><p className="eyebrow">HERBAL HEALTH CARE · BOTANICAL EDIT</p><h2>Shop the collection</h2></div><p>Simple rituals. Good ingredients.<br />A little more nature, every day.</p></div>
          <div className="category-list" aria-label="Filter by category">
            <button className={!category ? 'selected' : ''} onClick={() => { if (category) { setLoading(true); setPage(1); setCategory('') } }}>All products</button>
            {categories.map((item) => <button key={item.id} className={category === item.slug ? 'selected' : ''} onClick={() => { if (category !== item.slug) { setLoading(true); setPage(1); setCategory(item.slug) } }}>{item.name}</button>)}
          </div>
          {catalogError && <div className="empty-state" role="alert">{catalogError}<button onClick={() => { setLoading(true); setCatalogError(''); setCatalogReload((value) => value + 1) }}>Try again</button></div>}
          {loading && <div className="product-grid" aria-label="Loading products">{[1, 2, 3, 4].map((item) => <div className="product-skeleton" key={item} />)}</div>}
          {!loading && !catalogError && products.length === 0 && <div className="empty-state empty-catalog"><div className="empty-state-image"><img src={botanicalImage} alt="Fresh leaves, roots, and botanicals arranged for a natural care ritual" loading="lazy" /><span>THE NEXT RITUAL</span></div><div className="empty-state-copy"><p className="eyebrow">{category || search ? 'A NEW SEARCH' : 'A NOTE FROM HERBAL HEALTH CARE'}</p><h3>{category || search ? 'Nothing found this time.' : 'A fresh collection is taking shape.'}</h3><p>{category || search ? 'Try another search or browse the full collection.' : 'Coming soon: Herbal Health Care Stone Powder (100 g) and Herbal Health Care Stone Capsule (60 capsules).'}</p>{(category || search) && <button className="text-link" onClick={() => { setCategory(''); setSearch(''); setSearchInput(''); setPage(1); setLoading(true) }}>See all products <span aria-hidden="true">↗</span></button>}</div></div>}
          {!loading && products.length > 0 && <div className="product-grid">
            {products.map((product) => <article className="product-card" key={product.id}>
              <div className="product-image-wrap">
                <img src={product.image_url || heroImage} alt={product.name} loading="lazy" onError={(event) => { event.currentTarget.src = heroImage }} />
                {product.is_featured && <span className="product-tag">FEATURED</span>}
                {product.stock_quantity === 0 && <span className="sold-out">SOLD OUT</span>}
              </div>
              <div className="product-meta"><div><p className="product-category">{product.category?.name}</p><h3>{product.name}</h3></div><span className="price">{money(product.price)}</span></div>
              {product.description && <p className="product-description">{product.description}</p>}
              <button className="add-button" disabled={!product.stock_quantity} onClick={() => addToCart(product)}>{product.stock_quantity ? 'Add to bag' : 'Out of stock'} <span aria-hidden="true">+</span></button>
            </article>)}
          </div>}
          {!loading && pageCount > 1 && <nav className="pagination" aria-label="Product pages"><button disabled={page <= 1} onClick={() => { setLoading(true); setPage(page - 1) }}>Previous</button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => { setLoading(true); setPage(page + 1) }}>Next</button></nav>}
        </section>

        <section className="why-section" id="about">
          <div className="why-intro"><p className="eyebrow">THE HERBAL HEALTH CARE WAY</p><h2>Small rituals.<br /><em>More meaning.</em></h2><p>Everyday care can feel simple, thoughtful, and connected to the natural world around us.</p><a href="#shop" className="text-link">Find your everyday essential <span aria-hidden="true">↗</span></a></div>
          <div className="why-grid"><article><span className="why-number">01</span><span className="why-icon" aria-hidden="true">✳</span><h3>Made for everyday</h3><p>Herbal essentials designed to find a natural place in your routine.</p></article><article><span className="why-number">02</span><span className="why-icon" aria-hidden="true">⌁</span><h3>Rooted close to home</h3><p>Inspired by the plants, pace, and thoughtful traditions of Nepal.</p></article><article><span className="why-number">03</span><span className="why-icon" aria-hidden="true">↗</span><h3>Care, delivered</h3><p>A simple way to discover your next ritual, with delivery across Nepal.</p></article></div>
        </section>

        <section className="closing-cta"><div><p className="eyebrow">MAKE ROOM FOR A GOOD RITUAL</p><h2>Your everyday, a little more natural.</h2></div><a className="light-button" href="#shop">Shop Herbal Health Care <span aria-hidden="true">↗</span></a><span className="cta-flower" aria-hidden="true">✳</span></section>
      </main>

      <footer className="store-footer"><a className="brand" href="#top" aria-label="Herbal Health Care home"><span className="brand-name">Herbal Health Care</span><small>BOTANICAL WELLNESS</small></a><p>Nature, thoughtfully brought closer.</p><nav className="footer-contact-links" aria-label="Contact Herbal Health Care"><a href="tel:+9779717402140" aria-label="Call Herbal Health Care at +977 9717402140"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h3l2 5-2.2 2a15 15 0 0 0 6.2 6.2l2-2.2 5 2v3c0 1.1-.9 2-2 2C10 21 3 14 3 5c0-1.1.9-2 2-2Z" /></svg><span>+977 9717402140</span></a><a href="https://wa.me/9779717402140" target="_blank" rel="noopener noreferrer" aria-label="Chat with Herbal Health Care on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L4 20l.9-4A8.5 8.5 0 1 1 20.5 11.5Z" /><path d="M9 8.5c.5 2.5 2 4 4.5 5l1-1.2 2 .8c-.2 1.5-1.2 2.3-2.5 2.2-3.8-.5-6.7-3.4-7.2-7.2-.1-1.3.7-2.3 2.2-2.5l.8 2L9 8.5Z" /></svg><span>WhatsApp</span></a></nav><nav className="social-links" aria-label="Social media"><a href="https://www.facebook.com/profile.php?id=61595275610088" target="_blank" rel="noopener noreferrer" aria-label="Herbal Health Care on Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.019 4.388 11.019 10.125 11.879v-8.41H7.078v-3.469h3.047V9.43c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.953h-1.513c-1.491 0-1.956.929-1.956 1.882v2.27h3.328l-.532 3.469h-2.796v8.41C19.612 23.092 24 18.092 24 12.073z" /></svg></a><a href="https://www.instagram.com/herbalhealthcare375/" target="_blank" rel="noopener noreferrer" aria-label="Herbal Health Care on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg></a></nav><span className="footer-copyright">© {new Date().getFullYear()} Herbal Health Care · Nepal</span></footer>
      {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
      {modal && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal('') }}>
        {modal === 'auth' && <AuthDialog onClose={closeAuth} onSubmit={signIn} onGoogleSignIn={signInWithGoogle} clientId={googleClientId} />}
        {modal === 'cart' && <CartDialog cart={cart} user={user} onClose={() => setModal('')} onUpdate={updateItem} onLogin={() => setModal('auth')} onCheckout={startCheckout} />}
        {modal === 'checkout' && <CheckoutDialog cart={cart} onClose={() => setModal('cart')} onSubmit={checkout} />}
        {modal === 'account' && <AccountDialog user={user} orders={orders} onClose={() => setModal('')} onSignOut={signOut} onCancelOrder={cancelOrder} />}
        {modal === 'order-success' && <div className="dialog success-dialog"><button className="close-button" onClick={() => setModal('')} aria-label="Close">×</button><p className="eyebrow">THANK YOU</p><h2>Your order is in.</h2><p>We’ll prepare your herbal essentials. Payment is due when your order arrives.</p><button className="primary-button" onClick={() => setModal('account')}>View my orders</button></div>}
      </div>}
    </div>
  )
}

function AuthDialog({ onClose, onSubmit, onGoogleSignIn, clientId }) {
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const googleButton = useRef(null)

  useEffect(() => {
    if (!clientId) return undefined
    let active = true
    const buttonElement = googleButton.current
    const renderButton = () => {
      if (!active || !buttonElement || !window.google?.accounts?.id) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (result) => {
          if (!result.credential) { setError('Google sign-in did not return a credential.'); return }
          setBusy(true)
          setError('')
          try { await onGoogleSignIn(result.credential) }
          catch (requestError) { setError(requestError.response?.data?.detail || 'Google sign-in failed. Please try again.') }
          finally { setBusy(false) }
        },
      })
      buttonElement.replaceChildren()
      window.google.accounts.id.renderButton(buttonElement, {
        type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
        text: 'continue_with', logo_alignment: 'left', width: Math.min(360, buttonElement.clientWidth || 360),
      })
    }
    let script = document.getElementById('google-identity-services')
    if (window.google?.accounts?.id) renderButton()
    else if (!script) {
      script = document.createElement('script')
      script.id = 'google-identity-services'
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = renderButton
      script.onerror = () => setError('Google sign-in could not load. Check your internet connection.')
      document.head.appendChild(script)
    } else {
      script.addEventListener('load', renderButton, { once: true })
    }
    return () => { active = false; if (buttonElement) buttonElement.replaceChildren() }
  }, [clientId, onGoogleSignIn])

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true)
    const data = new FormData(event.currentTarget)
    const payload = mode === 'register'
      ? { username: data.get('username'), email: data.get('email'), password: data.get('password'), first_name: data.get('first_name') }
      : { identifier: data.get('identifier'), password: data.get('password') }
    try { await onSubmit(payload, mode) } catch (requestError) { setError(Object.values(requestError.response?.data || {}).flat().join(' ') || 'Could not sign in. Check your details and try again.') } finally { setBusy(false) }
  }
  return <div className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">YOUR HERBAL HEALTH CARE ACCOUNT</p><h2 id="auth-title">{mode === 'login' ? 'Welcome back.' : 'Join our community.'}</h2>
    {clientId ? <div className="google-login"><div ref={googleButton} className="google-button" />{busy && <span className="google-loading">Signing in…</span>}</div> : <p className="google-setup-note">Google sign-in is not configured yet. Add the same Google Web client ID to frontend/.env.local (VITE_GOOGLE_CLIENT_ID) and backend/.env (GOOGLE_OAUTH_CLIENT_ID), then restart both servers.</p>}
    <p className="auth-divider"><span>or continue with email</span></p>
    <form className="form-stack" onSubmit={submit}>{mode === 'register' && <><label>First name<input name="first_name" autoComplete="given-name" /></label><label>Username<input name="username" autoComplete="username" minLength="3" required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label></>}{mode === 'login' && <label>Email or username<input name="identifier" autoComplete="username" required /></label>}<label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength="8" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form>
    <p className="switch-auth">{mode === 'login' ? 'New to Herbal Health Care?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
  </div>
}

function CartDialog({ cart, user, onClose, onUpdate, onLogin, onCheckout }) {
  return <aside className="dialog drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title"><div className="drawer-heading"><div><p className="eyebrow">YOUR SELECTION</p><h2 id="cart-title">Shopping bag <span>({cart.item_count || 0})</span></h2></div><button className="close-button" onClick={onClose} aria-label="Close bag">×</button></div>
    {!user && <div className="inline-note">Your cart is saved in this browser. Sign in is required to place an order.</div>}
    {cart.items?.length ? <><div className="cart-items">{cart.items.map((item) => <div className="cart-line" key={item.id}><img src={item.image_url || heroImage} alt="" /><div className="cart-line-info"><h3>{item.product_name}</h3><span>{money(item.price)}</span><div className="quantity"><button onClick={() => onUpdate(item, item.quantity - 1)} aria-label={`Remove one ${item.product_name}`}>−</button><span>{item.quantity}</span><button onClick={() => onUpdate(item, item.quantity + 1)} aria-label={`Add one ${item.product_name}`}>+</button></div></div><button className="remove-link" onClick={() => onUpdate(item, 0)}>Remove</button></div>)}</div><div className="cart-total"><span>Subtotal</span><strong>{money(cart.subtotal)}</strong></div><p className="fine-print">Next, enter your phone number and delivery address. Payment is cash on delivery.</p><button className="primary-button full-button" onClick={onCheckout}>{user ? 'Enter delivery details' : 'Sign in and continue'} <span>→</span></button>{!user && <button className="secondary-button full-button cart-signin" onClick={onLogin}>Sign in to your account</button>}</> : <div className="empty-cart"><span aria-hidden="true">✳</span><h3>Your bag is waiting.</h3><p>Add a little nature to your everyday.</p><button className="secondary-button" onClick={onClose}>Continue shopping</button></div>}
  </aside>
}

function CheckoutDialog({ cart, onClose, onSubmit }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try { await onSubmit(values) } catch (requestError) { setError(Object.values(requestError.response?.data || {}).flat().join(' ') || 'Please check your details and try again.') } finally { setBusy(false) }
  }
  return <div className="dialog checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button className="close-button" onClick={onClose} aria-label="Back to cart">×</button><p className="eyebrow">DELIVERY DETAILS · CASH ON DELIVERY</p><h2 id="checkout-title">Where should we deliver?</h2><section className="checkout-summary" aria-label="Order summary"><h3>Your order</h3>{cart.items.map((item) => <div className="checkout-summary-line" key={item.id}><span>{item.product_name} <small>× {item.quantity}</small></span><strong>{money(item.line_total)}</strong></div>)}<div className="checkout-summary-total"><span>Subtotal</span><strong>{money(cart.subtotal)}</strong></div></section><form className="form-stack" onSubmit={submit}><label>Full name<input name="customer_name" autoComplete="name" required /></label><div className="form-row"><label>Phone number<input name="phone" type="tel" autoComplete="tel" placeholder="e.g. +977 98XXXXXXXX" required /></label><label>Email (optional)<input name="email" type="email" autoComplete="email" /></label></div><label>Delivery address<input name="address_line1" autoComplete="street-address" placeholder="Street, neighborhood, or nearest landmark" required /></label><label>Apartment, suite, or additional address details (optional)<input name="address_line2" autoComplete="address-line2" /></label><div className="form-row"><label>City / municipality<input name="city" autoComplete="address-level2" required /></label><label>District<input name="district" autoComplete="address-level1" /></label></div><label>Delivery instructions (optional)<textarea name="notes" rows="2" placeholder="Landmark, preferred delivery time, or other helpful details" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? 'Placing order…' : 'Place cash-on-delivery order'}</button></form></div>
}

function AccountDialog({ user, orders, onClose, onSignOut, onCancelOrder }) {
  return <div className="dialog account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">YOUR ACCOUNT</p><h2 id="account-title">Hello{user.first_name ? `, ${user.first_name}` : ''}.</h2><p className="account-email">{user.email}</p><div className="orders-heading"><h3>Your orders</h3><span>{orders.length}</span></div>{orders.length ? <div className="order-list">{orders.map((order) => <article className="order-card" key={order.id}><div><strong>#{order.number}</strong><span>{new Date(order.created_at).toLocaleDateString()}</span></div><span className={`order-status ${order.status}`}>{order.status}</span><strong>{money(order.total)}</strong>{order.status === 'pending' && <button className="cancel-order" onClick={() => onCancelOrder(order)}>Cancel order</button>}</article>)}</div> : <p className="fine-print">Your order history will appear here after checkout.</p>}<button className="secondary-button signout-button" onClick={onSignOut}>Sign out</button></div>
}
