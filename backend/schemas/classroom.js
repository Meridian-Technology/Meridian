const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const classroomSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    attributes: {
        type: Array,
        required: true
    },
    number_of_ratings: {
        type: Number
    },
    average_rating: {
        type: Number
    },
    checked_in:{
        type:Array,
        default:[]
    },
    mainSearch:{
        type:Boolean,
        default:true,
        required:true
    },
    building:{
        type:String,
        required:false
    }
});

module.exports = classroomSchema;