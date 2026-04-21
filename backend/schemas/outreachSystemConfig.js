const mongoose = require('mongoose');

const attributeSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        source: { type: String, required: true, trim: true },
        editable: { type: Boolean, default: false }
    },
    { _id: false }
);

const rolePermissionSchema = new mongoose.Schema(
    {
        role: { type: String, required: true, trim: true },
        canSend: { type: Boolean, default: false },
        canConfigure: { type: Boolean, default: false }
    },
    { _id: false }
);

const outreachSystemConfigSchema = new mongoose.Schema(
    {
        attributes: {
            type: [attributeSchema],
            default: [
                { key: 'major', label: 'Major / Department', source: 'SIS', editable: false },
                { key: 'graduation_year', label: 'Graduation year', source: 'SIS', editable: false },
                { key: 'program_type', label: 'Program type', source: 'SIS', editable: false },
                { key: 'enrollment_status', label: 'Enrollment status', source: 'SIS', editable: false },
                { key: 'college', label: 'College', source: 'SIS', editable: false },
                { key: 'custom_cohort', label: 'Custom cohort', source: 'Manual', editable: true }
            ]
        },
        dataSource: {
            primarySource: {
                type: String,
                default: 'Student Information System (SIS)',
                trim: true
            },
            lastSyncAt: { type: Date, default: null },
            syncedStudentCount: { type: Number, default: 0 }
        },
        roles: {
            type: [rolePermissionSchema],
            default: [
                { role: 'Admin', canSend: true, canConfigure: true },
                { role: 'Outreach manager', canSend: true, canConfigure: false },
                { role: 'Viewer', canSend: false, canConfigure: false }
            ]
        },
        delivery: {
            emailEnabled: { type: Boolean, default: true },
            inAppEnabled: { type: Boolean, default: true }
        },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    { timestamps: true }
);

module.exports = outreachSystemConfigSchema;
