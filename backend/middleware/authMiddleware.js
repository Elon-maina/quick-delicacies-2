const authenticateUser = (req, res, next) => {
    console.log("Checking session data:", req.session);  //Debugging session data

    if (!req.session || !req.session.user) {
        console.log("No session found or user not logged in.");
        return res.status(401).json({ error: "Unauthorized: Please log in" });
    }

    req.user_id = req.session.user.id; //Ensure correct property access
    console.log("Authenticated user_id:", req.user_id);  //Log user ID

    next();
};

module.exports = authenticateUser;
