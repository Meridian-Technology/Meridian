require('dotenv').config();
const express = require('express');
const axios = require('axios');

function sendDiscordMessage (title, message, type){
    if(process.env.NODE_ENV === "development"){
        return;
    }

    const typeColors={
        error: 16711680,
        normal: 16414061,
        newUser: 10536191,
    }
    const embed = {
        title: title,
        description: message,
        color: typeColors[type],
        timestamp: new Date(),
        footer: {
          text: 'Study Compass',
        },
        author: {
            name: 'Study Compass Tracker', // Author's name
            icon_url: 'https://meridian.study/Logo.png', // URL to author's avatar image
          },
    };
    try{
        axios.post(process.env.DISCORD_WEBHOOK, {
            embeds: [embed]
        })
    } catch (error){
        console.log(error);
    }

} 

module.exports = { sendDiscordMessage };