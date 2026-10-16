// Admin pages: redirect to the login page unless the current session belongs to an admin.
// (The server enforces this on every admin API call as well; this only keeps the pages hidden.)
document.documentElement.style.visibility = "hidden";
fetch("/auth/session", { credentials: "include" })
    .then((response) => response.json())
    .then((data) => {
        if (!data.loggedIn || !data.user || data.user.role !== "admin") throw new Error("Not an admin");
        document.documentElement.style.visibility = "";
    })
    .catch(() => {
        window.location.href = "../login.html";
    });
