const express = require('express');
const { verifyToken, verifyTokenOptional } = require('../middlewares/verifyToken');
const { sortByAvailability } = require('../helpers.js');
const multer = require('multer');
const path = require('path');
const s3 = require('../aws-config');
const mongoose = require('mongoose');
const { clean } = require('../services/profanityFilterService');
const getModels = require('../services/getModelService');
const { PUBLIC_USER_FIELDS } = require('../constants/publicUserFields');

const router = express.Router();


// Route to get all number of ratings and average for Classroom 
router.post('/average_rating', verifyToken, async (req, res) => {
    const { Rating, Classroom, User } = getModels(req, 'Rating', 'Classroom', 'User');
    const classroomId = req.body.classroomId;
    const userId = req.body.userId;

    try {
        //get all ratings
        const ratings = await Rating.find({ classroom_id: classroomId });
        if (ratings.length === 0) {
            return res.status(404).json({ success: false, message: 'No ratings found for this classroom' });
        }

        const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0);
        const averageScore = totalScore / ratings.length;

        res.json({ success: true, average_rating: averageScore, number_of_ratings: ratings.length });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Error searching for average ratings', error: error.message });
    }
    
});

// Route to update rating to Classroom Schema
router.post('/update_rating', verifyToken, async (req, res) => {
    const { Rating, Classroom, User } = getModels(req, 'Rating', 'Classroom', 'User');
    const { classroomId, userId, comment, score, upvotes, downvotes } = req.body;

    try {
        let rating = await Rating.findOne({ classroom_id: classroomId, user_id: userId });

        if (rating) {
            rating.comment = clean(comment);
            rating.score = score;
            rating.upvotes = upvotes;
            rating.downvotes = downvotes;
            await rating.save();
        } else {
            rating = new Rating({
                classroom_id: classroomId,
                user_id: userId,
                comment,
                score,
                upvotes,
                downvotes
            });
            await rating.save();
            //update user stats
            const user = await User.findOne({ _id: userId });
            user.contributions += 1;
            await user.save();
        }

        const ratings = await Rating.find({ classroom_id: classroomId });
        const totalScore = ratings.reduce((sum, rating) => sum + rating.score, 0);
        const averageScore = totalScore / ratings.length;

        const classroom = await Classroom.findOne({ _id: classroomId });
        if (classroom) {
            classroom.number_of_ratings = ratings.length;
            classroom.average_rating = averageScore;
            await classroom.save();
        } else {
            console.log(`POST: /update_rating/${classroomId}/${userId} failed`);
            res.status(500).json({ success: false, message: 'Classroom does not exist'});
        }

        console.log(`POST: /update_rating/${classroomId}/${userId} successful`);
        res.status(200).json({ success: true, message: 'Successfully updated rating', data: {score: averageScore, num_ratings:ratings.length} });
    } catch (error) {
        console.error(error);
        console.log(`POST: /update_rating/${classroomId}/${userId} faled`);
        res.status(500).json({ success: false, message: 'Error updating or retrieving ratings', error: error.message });
    }
});

router.get('/get-user-ratings', verifyToken, async (req, res) => {
    const { Rating } = getModels(req, 'Rating');
    const userId = req.user.userId;
    try{
        const ratings = await Rating.find({ user_id: userId });
        console.log(`POST: /get-user-ratings/${userId}`);
        res.json({ success: true, message: "Ratings fetched", data: ratings });
    } catch(error){
        console.log(`POST: /get-user-ratings/${userId} failed`);
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message});
    }
});

router.get('/user-rated', verifyToken, async (req, res) => {
    const { Rating } = getModels(req, 'Rating');
    const userId = req.user.userId;
    const classroomId = req.query.classroomId;
    try{
        const rating = await Rating.findOne({ user_id: userId, classroom_id: classroomId });
        if(!rating){
            res.json({ success: true, message: "Rating not found", data: null });
            return;
        }
        console.log(`GET: /user-rated/${userId}/${classroomId}`);
        res.json({ success: true, message: "Rating found", data: rating });
    } catch(error){
        console.log(`GET: /user-rated/${userId}/${classroomId} failed`);
        return res.status(500).json({ success: false, message: 'Error finding rating', error: error.message});
    }

});

router.get('/get-ratings', async (req, res) => {
    const { Rating } = getModels(req, 'Rating');
    let classroomId = req.query.classroomId;
    try{
        classroomId = new mongoose.Types.ObjectId(classroomId);
        //attach user object to each rating
        const ratings = await Rating.aggregate([
            { $match: { classroom_id: classroomId } },
            {
                $lookup: {
                    from: "users",
                    localField: "user_id",
                    foreignField: "_id",
                    as: "user_info"
                }
            },
            // Ratings are public, so keep only the reviewer's public profile fields.
            {
                $addFields: {
                    user_info: {
                        $map: {
                            input: "$user_info",
                            as: "u",
                            in: Object.fromEntries(
                                ['_id', ...PUBLIC_USER_FIELDS].map((field) => [field, `$$u.${field}`])
                            )
                        }
                    }
                }
            }
        ]);
        // const ratings = await Rating.find({ classroom_id: classroomId });
        console.log(`GET: /get-ratings/${classroomId}`);
        res.json({ success: true, message: "Ratings fetched", data: ratings });
    } catch(error){
        console.log(`GET: /get-ratings/${classroomId} failed`);
        return res.status(500).json({ success: false, message: 'Error finding ratings', error: error.message});
    }
});

router.post('/delete-rating', verifyToken, async (req, res) => {
    const { Rating } = getModels(req, 'Rating');
    const userId = req.user.userId;
    const classroomId = req.body.classroomId;
    try{
        const rating = await Rating.findOne({ user_id: userId, classroom_id: classroomId });
        if(!rating){
            return res.status(404).json({ success: false, message: "Rating not found" });
        }
        await rating.delete();
        console.log(`POST: /delete-rating/${userId}/${classroomId}`);
        res.json({ success: true, message: "Rating deleted" });
    }
    catch(error){
        return res.status(500).json({ success: false, message: 'Error finding rating', error: error.message});
    }
});

// router.post('/get-detailed-rating-batch', async (req, res) => {
//     let queries = req.body.queries;
//     try {
//         //attach user info to each rating
//         queries = queries.map(id => new mongoose.Types.ObjectId(id));
//         const results = Rating.aggregate([
//             { $match: { classroom_id: { $in: queries } } },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "user_id",
//                     foreignField: "_id",
//                     as: "user_info"
//                 }
//             }
//         ]);
//     } catch (error) {   
//         return res.status(500).json({ success: false, message: 'Error finding ratings', error: error.message});
//     }
// }); 

router.post('/send-report', verifyToken, async (req, res) => {
    const { Report, User } = getModels(req, 'Report', 'User');

    const userId = req.user.userId;
    const report = req.body.report;
    const type = req.body.type;
    try{
        const user = await User.findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        //store report in mongo
        await Report.create({ user_id: userId, type: type, report: report });
        console.log(`POST: /send-report/${userId}`);
        res.json({ success: true, message: "Report saved" });
    } catch(error){
        return res.status(500).json({ success: false, message: 'Error finding user', error: error.message});
    }
});


module.exports = router;
