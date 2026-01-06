import apiRequest from '../../utils/postRequest';

const onboardUser = async (name, username, classroom, recommendation) => {
    try{
        let classroomPreferences = "";
        for(let i = 0; i  < classroom.length ; i++){
            classroomPreferences += classroom[i][0];
        }

        const responseBody = await apiRequest('/update-user', {name, username, classroom : classroomPreferences, recommendation, onboarded : true});
        console.log(responseBody);
        return responseBody;

    } catch (error){
        throw(error);
    }
}

export { onboardUser }