document.addEventListener("DOMContentLoaded", () => {
    const menuContainer = document.getElementById("menu-container");

    fetch("http://localhost:3000/dishes")
        .then(response => response.json())
        .then(data => {
            menuContainer.innerHTML = "";
            data.forEach(dish => {
                const foodDiv = document.createElement("div");
                foodDiv.classList.add("food-item");
                foodDiv.innerHTML = `
                    <img src="${dish.imageURL}" alt="${dish.name}">
                    <h3>${dish.name}</h3>
                    <p>PRICE: KSH ${dish.price}</p>
                    <button class="add-to-cart">ADD TO CART</button>
                `;
                menuContainer.appendChild(foodDiv);
            });
        })
        .catch(error => console.error("Error fetching dishes:", error));
});
