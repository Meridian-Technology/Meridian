import apiRequest from '../../utils/postRequest';

async function getVisitsByDay() {
    try {
        const data = await apiRequest('/visits-by-day', null, { method: 'GET' });
        if (data && !data.error && Array.isArray(data)) {
            return data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching visits by day', error);
        return [];
    }
}

export { getVisitsByDay };