import apiRequest from '../../utils/postRequest';

const getUser = async (userId) => {
    try{
        const responseBody = await apiRequest('/get-user', null, {
            method: 'GET',
            params: { userId }
        });
        return responseBody.user;
    } catch(error){
        throw error;
    }
}

const getAllEvents = async () => {
    try{
        const responseBody = await apiRequest('/get-all-events', null, {
            method: 'GET'
        });
        return responseBody.events;
    } catch(error){
        throw error;
    }
}

const getOIEEvents = async () => {
    try{
        const responseBody = await apiRequest('/oie/get-pending-events', null, {
            method: 'GET'
        });
        return responseBody.events;
    } catch(error){
        throw error;
    }
}

const createEvent = async (name, type, hosting, location, date, description, image, classroom_id) => {
    try{
        const responseBody = await apiRequest('/create-event', {
            name, type, hosting, location, date, description, image, classroom_id
        });
        return responseBody;
    }
    catch(error){
        throw error;
    }
}

export { getAllEvents, createEvent, getOIEEvents };