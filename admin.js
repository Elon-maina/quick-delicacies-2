document.addEventListener("DOMContentLoaded", () => {
    const adminContainer = document.getElementById("admin-menu-container");
    const form = document.getElementById("food-form");

    // Fetch Dishes
    function fetchDishes() {
        fetch("http://localhost:3000/dishes")
            .then(response => response.json())
            .then(data => {
                adminContainer.innerHTML = "";
                data.forEach(dish => {
                    const foodDiv = document.createElement("div");
                    foodDiv.classList.add("food-item");
                    foodDiv.innerHTML = `
                        <img src="${dish.imageURL}" alt="${dish.name}">
                        <h3>${dish.name}</h3>
                        <p>PRICE: KSH ${dish.price}</p>
                        <button class="delete-btn" data-id="${dish.id}">DELETE</button>
                    `;
                    adminContainer.appendChild(foodDiv);
                });

                // Delete Dish
                document.querySelectorAll(".delete-btn").forEach(button => {
                    button.addEventListener("click", (e) => {
                        const id = e.target.dataset.id;
                        fetch(`http://localhost:3000/dishes/${id}`, { method: "DELETE" })
                            .then(() => fetchDishes());
                    });
                });
            });
    }

    // Add Dish
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("food-name").value;
        const price = document.getElementById("food-price").value;
        const imageURL = document.getElementById("food-image").value;

        fetch("http://localhost:3000/dishes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, price, imageURL })
        }).then(() => {
            form.reset();
            fetchDishes();
        });
    });

    fetchDishes();
});
