import apiRequest from "./utils/postRequest";

//todo: make protected route
const changeClasroom = async (id, attributes, imageUrl) => {
    try {
        const responseBody = await apiRequest(`/changeclassroom/`, { id, attributes, imageUrl });
        if (!responseBody.success) {
            // Log the error if success is false
            console.error("Error changing room:", responseBody.message);
            return;
        }
        return responseBody.data;
    } catch (error) {
        if (error.response) {
            // The server responded with a status code outside the 2xx range
            console.error("Error changing room: HTTP Status", error.response.status, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            console.error("Error changing room: No response received", error.request);
        } else {
            // Something else caused the error, like a setup issue
            console.error("Error:", error.message);
        }
        throw error;
    }
};  

//expects roomid, userid, and operation, true for save, false for unsave
const save = async (roomId, userId, operation) => {
    try {
        const responseBody = await apiRequest(`/save/`, { roomId, userId, operation });
        if (!responseBody.success) {
            // Log the error if success is false
            console.error("Error saving room:", responseBody.message);
            return;
        }
        return responseBody.data;
    } catch (error) {
        if (error.response) {
            // The server responded with a status code outside the 2xx range
            console.error("Error saving room: HTTP Status", error.response.status, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            console.error("Error saving room: No response received", error.request);
        } else {
            // Something else caused the error, like a setup issue
            console.error("Error:", error.message);
        }
        throw error;
    }
};

const saveUser = async (name, username, email, password, recommendation, classroom) => {
    try{
        const responseBody = await apiRequest('/update-user', {name, email, username, classroom, recommendation, onboarded :null});
        if (responseBody.success) {
            console.log("User saved successfully");
        } else {
            console.error("User save unsuccessful");
        }
    } catch(error){
        console.error("Error saving user");
        throw error;
    }
}

const checkUsername = async (username) => {
    try {
        const responseBody = await apiRequest("/check-username/", { username });
        if (!responseBody.success) {
            // Log the error if the response status is not OK
            console.error("Error checking username:", responseBody.message);
            return null;
        }
        if (!responseBody.success) {
            return false;
        }
        return true;
    } catch (error) {
        throw error;
    }
}

const sendError = async (description, roomid) => {
    try {
        const reportData = {
            report: {
                roomid: roomid,
                description: description
            },
            type: "incorrectData"
        };

        await apiRequest('/send-report', reportData);
    } catch (error) {
        throw error;
    }
}

const checkIn = async (classroomId) => {
    try{
        const responseBody = await apiRequest('/check-in', {classroomId});
        console.log("successful");
        return responseBody;
    } catch (error){
        throw error;
    }
}

const checkOut = async (classroomId) => {
    try{
        const responseBody = await apiRequest('/check-out', {classroomId});
        console.log("successful");
        return responseBody;
    } catch(error){
        throw error;
    }
}

const getUser = async (userId) => {
    try{
        const responseBody = await apiRequest('/get-user', null, {
            method: 'GET',
            params: { userId }
        });
        console.log("successful");
        return responseBody.user;
    } catch(error){
        throw error;
    }
}

const getUsers = async (userIds) => {
    try{
        const responseBody = await apiRequest('/get-users', null, {
            method: 'GET',
            params: { userIds }
        });
        console.log("successful");
        return responseBody.users;
    } catch(error){
        throw error;
    }
}

//all purpose rating route, can be used to create new ratings, update ratings (update downvote), and edit ratings
const updateRating = async (classroomId, userId, comment, score, upvotes, downvotes) => {
    try{
        const responseBody = await apiRequest('/update_rating', {classroomId, userId, comment, score, upvotes, downvotes});
        if (!responseBody.success) {
            console.error("Error updating rating:", responseBody.message);
            return;
        }
        return responseBody.data;
    } catch (error) {
        console.error("Error updating rating:", error);
        throw error;
    }
}

const userRated = async (classroomId, userId) => {
    try{
        const responseBody = await apiRequest('/user-rated', null, {
            method: 'GET',
            params: { classroomId, userId }
        });
        if (!responseBody.success) {
            console.error("Error checking if user rated:", responseBody.message);
            return;
        }
        return responseBody.data;
    } catch (error) {
        console.error("Error checking if user rated:", error);
        throw error;
    }
}

const getRatings = async (classroomId) => {
    try{
        const responseBody = await apiRequest('/get-ratings', null, {
            method: 'GET',
            params: { classroomId }
        });
        if (!responseBody.success) {
            console.error("Error getting ratings:", responseBody.message);
            return;
        }
        console.log(responseBody);
        return responseBody.data;
    } catch (error) {
        console.error("Error getting ratings:", error);
        throw error;
    }
}

const mainSearchChange = async (classroomId) => {
    try{
        const responseBody = await apiRequest('/main-search-change', {classroomId});
        if (!responseBody.success) {
            console.error("Error changing main search:", responseBody.message);
            return;
        }
        return responseBody.data;
    } catch (error) {
        console.error("Error changing main search:", error);
        throw error;
    }
}

const getRecommendation = async () => {
    try{
        const responseBody = await apiRequest('/get-recommendation', null, {
            method: 'GET'
        });
        if (!responseBody.success) {
            console.error("Error getting recommendation:", responseBody.message);
            return;
        }
        console.log(responseBody);
        return responseBody;
    } catch (error) {
        console.error("Error getting recommendation:", error);
        throw error;
    }
}

export { changeClasroom, save, saveUser, checkUsername, sendError, checkIn, checkOut, getUser, getUsers, updateRating, userRated, getRatings, mainSearchChange, getRecommendation };