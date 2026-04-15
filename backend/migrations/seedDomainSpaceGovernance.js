#!/usr/bin/env node
require('dotenv').config();

const mongoose = require('mongoose');
const { connectToDatabase } = require('../connectionsManager');
const getModels = require('../services/getModelService');

function getDefaultSpaceGovernance() {
    return {
        governingScope: {
            kind: 'all_spaces',
            buildingIds: [],
            spaceIds: [],
            spaceGroupIds: []
        },
        concernScope: {
            kind: 'campus_wide',
            buildingIds: [],
            spaceIds: [],
            spaceGroupIds: []
        },
        scopeMode: 'inclusive',
        priorityRules: []
    };
}

async function run() {
    const school = process.env.MIGRATION_SCHOOL || process.argv[2] || 'rpi';
    const db = await connectToDatabase(school);
    const req = { db };
    const { Domain } = getModels(req, 'Domain');

    const result = await Domain.updateMany(
        {
            $or: [
                { spaceGovernance: { $exists: false } },
                { spaceGovernance: null }
            ]
        },
        {
            $set: {
                spaceGovernance: getDefaultSpaceGovernance()
            }
        }
    );

    console.log(
        `[seedDomainSpaceGovernance] school=${school} matched=${result.matchedCount || 0} modified=${result.modifiedCount || 0}`
    );
}

run()
    .catch((error) => {
        console.error('[seedDomainSpaceGovernance] failed', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
