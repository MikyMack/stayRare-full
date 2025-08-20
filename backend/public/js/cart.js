  const isLoggedIn = <%= user ? 'true' : 'false' %>;
      
          function getGuestCart() {
            try {
              return JSON.parse(localStorage.getItem('guestCart')) || [];
            } catch (e) {
              return [];
            }
          }
      
          function setGuestCart(cart) {
            localStorage.setItem('guestCart', JSON.stringify(cart));
          }
      
          function calculateSubtotal(items) {
            return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          }
      
          function renderCart(cartItems) {
            if (!isLoggedIn) return;
            const cartList = document.querySelector('.cart-drawer-items-list');
            const cartActionsSelector = '.cart-drawer-actions';
            const oldActions = document.querySelector(cartActionsSelector);
            if (oldActions) oldActions.remove();
      
            const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
            document.querySelectorAll('.js-cart-items-count').forEach(el => el.textContent = cartCount);
      
            if (cartItems.length === 0) {
              cartList.innerHTML = '<p class="text-center py-4">Your cart is empty</p>';
              return;
            }
      
            cartList.innerHTML = cartItems.map((item, idx) => `
              <div class="cart-drawer-item d-flex position-relative" data-item-id="${item._id || item.productId || item.product}">
                <div class="position-relative">
                  <a href="/product/${item.productId || item.product}">
                    <img loading="lazy" class="cart-drawer-item__img" src="${item.productImage}" alt="${item.productName}">
                  </a>
                </div>
                <div class="cart-drawer-item__info flex-grow-1">
                  <h6 class="cart-drawer-item__title fw-normal"><a href="/product/${item.productId || item.product}">${item.productName}</a></h6>
                  ${item.selectedColor ? `<p class="cart-drawer-item__option text-secondary">Color: ${item.selectedColor}</p>` : ''}
                  ${item.selectedSize ? `<p class="cart-drawer-item__option text-secondary">Size: ${item.selectedSize}</p>` : ''}
                  <div class="d-flex align-items-center justify-content-between mt-1">
                    <div class="qty-control position-relative">
                      <input type="number" name="quantity" value="${item.quantity}" min="1"
                        class="qty-control__number border-0 text-center"
                        data-item-id="${item._id || item.productId || item.product}">
                      <div class="qty-control__reduce text-start js-reduce-quantity" data-item-id="${item._id || item.productId || item.product}">-</div>
                      <div class="qty-control__increase text-end js-increase-quantity" data-item-id="${item._id || item.productId || item.product}">+</div>
                    </div>
                    <span class="cart-drawer-item__price money price">₹${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
                <button class="btn-close-xs position-absolute top-0 end-0 js-cart-item-remove" data-item-id="${item._id || item.productId || item.product}"></button>
              </div>
              <hr class="cart-drawer-divider">
            `).join('');
      
            const subtotal = calculateSubtotal(cartItems);
            const actions = document.createElement('div');
            actions.className = 'cart-drawer-actions position-absolute start-0 bottom-0 w-100';
            actions.innerHTML = `
              <hr class="cart-drawer-divider">
              <div class="d-flex justify-content-between">
                <h6 class="fs-base fw-medium">SUBTOTAL:</h6>
                <span class="cart-subtotal fw-medium">₹${subtotal.toFixed(2)}</span>
              </div>
              <a href="/cart" class="btn btn-light mt-3 d-block">View Cart</a>
              <a href="/checkout" class="btn btn-primary mt-3 d-block">Checkout</a>
            `;
            cartList.parentNode.appendChild(actions);
      
            attachCartHandlers();
          }
      
          function fetchUserCart() {
            return fetch('/cartItems', { credentials: 'same-origin' })
              .then(res => res.json())
              .then(cart => cart && cart.items ? cart.items : []);
          }
      
          function fetchGuestCart() {
            return Promise.resolve(getGuestCart());
          }
      
          function updateCartItem(itemId, quantity) {
            if (isLoggedIn) {
              fetch(`/update-cart/${itemId}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ quantity })
              })
              .then(res => res.json())
              .then(cart => renderCart(cart.items || []))
              .catch(() => reloadCart());
            }
          }
      
          function removeCartItem(itemId) {
            if (isLoggedIn) {
              fetch(`/remove-cart/${itemId}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json'
                }
              })
              .then(res => res.json())
              .then(cart => renderCart(cart.items || []))
              .catch(() => reloadCart());
            }
          }
      
          function attachCartHandlers() {
            if (!isLoggedIn) return;
            document.querySelectorAll('.js-reduce-quantity').forEach(button => {
              button.onclick = function() {
                const itemId = this.getAttribute('data-item-id');
                const input = this.parentElement.querySelector('input');
                let quantity = parseInt(input.value);
                if (quantity > 1) {
                  quantity--;
                  input.value = quantity;
                  updateCartItem(itemId, quantity);
                }
              };
            });
      
            document.querySelectorAll('.js-increase-quantity').forEach(button => {
              button.onclick = function() {
                const itemId = this.getAttribute('data-item-id');
                const input = this.parentElement.querySelector('input');
                let quantity = parseInt(input.value) + 1;
                input.value = quantity;
                updateCartItem(itemId, quantity);
              };
            });
           
            document.querySelectorAll('.qty-control__number').forEach(input => {
              input.onchange = function() {
                const itemId = this.getAttribute('data-item-id');
                let quantity = parseInt(this.value);
                if (quantity >= 1) {
                  updateCartItem(itemId, quantity);
                } else {
                  this.value = 1;
                }
              };
            });
         
            document.querySelectorAll('.js-cart-item-remove').forEach(button => {
              button.onclick = function() {
                const itemId = this.getAttribute('data-item-id');
                removeCartItem(itemId);
              };
            });
          }
      
          function reloadCart() {
            if (isLoggedIn) {
              fetchUserCart().then(renderCart);
            } else if (window.reloadCart) {
              window.reloadCart();
            }
          }
      
          document.addEventListener('DOMContentLoaded', function() {
            if (isLoggedIn) reloadCart();
          });
      
          window.reloadCart = reloadCart;