document.addEventListener("DOMContentLoaded", async () => { 
    await verifySession(); 
    await loadMenu();
    await loadCart(); 
    updateCartCounter(); 
    setupSearch(); // Set up the search functionality
});

// Verify Session Before Loading Content
async function verifySession() {
    try {
        const response = await fetch("http://localhost:5000/auth/session", {
            method: "GET",
            credentials: "include" 
        });

        if (response.status === 401) {
            console.warn("Session invalid. Redirecting to login...");
            await logout(); 
            return;
        }

        const data = await response.json();
        console.log("Session Verified:", data);
    } catch (error) {
        console.error("Error verifying session:", error);
        await logout();
    }
}

// Load Menu with Credentials
async function loadMenu() {
    try {
        const response = await fetch("http://localhost:5000/menu", { credentials: "include" });

        if (!response.ok) {
            throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const menuContainer = document.getElementById("menu");

        if (!menuContainer) {
            console.error("Error: #menu element not found in HTML.");
            return;
        }

        // Store the full menu data for searching
        window.fullMenuData = data; 

        renderMenu(data); // Render the full menu initially
    } catch (error) {
        console.error("Error loading menu:", error);
    }
}

// Function to render menu items
function renderMenu(data) {
    const menuContainer = document.getElementById("menu");
    menuContainer.innerHTML = data
        .map(
            (dish) => `
            <div class="menu-item">
                <img src="${dish.image}" width="150">
                <h2 class="dish-name">${dish.name}</h2> 
                <h2 class="dish-price"> Ksh ${dish.price}</h2>
                <button class="add-to-cart" onclick="addToCart(${dish.id})">Add to Cart</button>
            </div>
        `
        )
        .join("");
}

// Set up search functionality
function setupSearch() {
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query) {
            const filteredMenu = window.fullMenuData.filter(dish => dish.name.toLowerCase().startsWith(query));
            renderMenu(filteredMenu);
        } else {
            renderMenu(window.fullMenuData); // Show full menu if search is empty
        }
    });
}

// Load Cart with Session Check & Update UI
async function loadCart() {
    try {
        const response = await fetch("http://localhost:5000/cart", { credentials: "include" });

        if (response.status === 401) {
            console.warn("Session expired. Logging out...");
            await logout();
            return;
        }

        if (!response.ok) {
            throw new Error(`Error: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const cartItems = document.getElementById("cart-items");
        const totalPriceElement = document.getElementById("total-price");

        if (!cartItems || !totalPriceElement) {
            console.error("Error: #cart-items or #total-price not found in HTML.");
            return;
        }

        cartItems.innerHTML = ""; 
        let total = 0;

        data.forEach((item) => {
            const itemTotalPrice = parseFloat(item.price) * parseInt(item.quantity);
            total += itemTotalPrice;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${item.name}</td>
                <td>Ksh ${item.price.toFixed(2)}</td>
                <td>
                    <button onclick="decrementItem(${item.id})" class="quantity-button">-</button>
                    <input type="number" id="quantity-${item.id}" class="quantity" value="${item.quantity}" min="1" onchange="updateQuantity(${item.id}, this.value)">
                    <button onclick="incrementItem(${item.id})" class="quantity-button">+</button>
                </td>
                <td>
                    <button onclick="removeFromCart(${item.id})" class="remove-from-cart">Remove</button>
                </td>
            `;
            cartItems.appendChild(tr);
        });

        totalPriceElement.innerText = total.toFixed(2);
        updateCartCounter();
    } catch (error) {
        console.error("Error loading cart:", error);
    }
}

// Update Cart Counter in Header
function updateCartCounter() {
    fetch("http://localhost:5000/cart", { credentials: "include" })
        .then((response) => response.json())
        .then((data) => {
            const cartCounter = document.getElementById("cart-counter");

            if (!cartCounter) {
                console.error("Error: #cart-counter not found in HTML.");
                return;
            }

            const totalItems = data.reduce((sum, item) => sum + item.quantity, 0);
            cartCounter.textContent = totalItems;
        })
        .catch((error) => console.error("Error updating cart counter:", error));
}

// Update Quantity from Input Field
async function updateQuantity(cartId, newQuantity) {
    if (newQuantity < 1) {
        console.warn("Quantity must be at least 1");
        return;
    }
    try {
        await fetch(`http://localhost:5000/cart/update/${cartId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ quantity: parseInt(newQuantity) })
        });
        await loadCart();
    } catch (error) {
        console.error("Error updating quantity:", error);
    }
}

// Increment Cart Item Quantity
async function incrementItem(cartId) {
    let quantityInput = document.getElementById(`quantity-${cartId}`);
    quantityInput.value = parseInt(quantityInput.value) + 1;
    await updateQuantity(cartId, quantityInput.value);
}

// Decrement Cart Item Quantity
async function decrementItem(cartId) {
    let quantityInput = document.getElementById(`quantity-${cartId}`);
    if (parseInt(quantityInput.value) > 1) {
        quantityInput.value = parseInt(quantityInput.value) - 1;
        await updateQuantity(cartId, quantityInput.value);
    }
}

// Add to Cart with Session Check
async function addToCart(dishId) {
    try {
        // Check if the item is already in the cart
        const cartResponse = await fetch("http://localhost:5000/cart", { credentials: "include" });
        const cartData = await cartResponse.json();

        // Check if the item exists in the cart
        const itemInCart = cartData.find(item => item.dish_id === dishId);
        if (itemInCart) {
            alert("Item already in cart!"); // Display an alert
            return; // Exit the function
        }

        // Proceed to add the item to the cart
        const response = await fetch("http://localhost:5000/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ dish_id: dishId, quantity: 1 }),
        });

        if (response.status === 401) {
            console.warn("Session expired. Logging out...");
            await logout();
            return;
        }

        loadCart(); 
        updateCartCounter(); 
    } catch (error) {
        console.error("Error adding to cart:", error);
    }
}

// Remove from Cart with Session Check
async function removeFromCart(cartId) {
    try {
        const response = await fetch(`http://localhost:5000/cart/remove/${cartId}`, {
            method: "DELETE",
            credentials: "include",
        });

        if (response.status === 401) {
            console.warn("Session expired. Logging out...");
            await logout();
            return;
        }

        loadCart();
        updateCartCounter();
    } catch (error) {
        console.error("Error removing from cart:", error);
    }
}