const express = require("express");
const router = express.Router();
const {
    verifyToken,
    verifyTokenOptional,
} = require("../middlewares/verifyToken.js");
const mongoose = require("mongoose");
const { clean, isProfane } = require("../services/profanityFilterService.js");
const getModels = require("../services/getModelService.js");
const { Resend } = require('resend');
const { render } = require('@react-email/render')
const React = require('react');
const ForgotEmail = require('../emails/ForgotEmail').default;
const resend = new Resend(process.env.RESEND_API_KEY);
const multer = require('multer');
const path = require('path');
const { uploadImageToS3, upload } = require('../services/imageUploadService');
const { requireMemberManagement, requireOrgOwner } = require('../middlewares/orgPermissions');
const NotificationService = require('../services/notificationService');

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size exceeds 5MB limit.'
            });
        }
    } else if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    next();
};

//Route to get a specific org by name
router.get("/get-org/:id", async (req, res) => {
    //May eventually change login permissions
    const { Org } = getModels(req, "Org");

    try {
        const orgId = req.params.id;

        //Find the Org
        const org = await Org.find({ _id: orgId });

        if (org !== null) {
            // If the org exists, return it
            console.log(`GET: /get-org/${orgId}`);
            res.json({ success: true, message: "Org found", org: org });
        } else {
            // If not found, return a 404 with a message
            return res.status(404).json({ success: false, message: "Org not found" });
        }
    } catch (error) {
        // Handle any errors that occur during the process
        console.log(`GET: /get-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error retrieving org data",
                error: error.message,
            });
    }
});

router.get("/get-org-by-name/:name", verifyToken,  async (req, res) => {
    const { Org, OrgMember, OrgFollower, Event, User, OrgMemberApplication } = getModels(req, "Org", "OrgMember", "OrgFollower", "Event", "User", "OrgMemberApplication");
    const { exhaustive } = req.query;

    try {
        const orgName = req.params.name;

        const org = await Org.findOne({ org_name: orgName }).populate('memberForm');

        if (!org) {
            console.log(`GET: /get-org-by-name/${orgName} - Org not found`);
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        const exhaustiveData = {
            eventCount: 0,
            memberCount: 0,
            followerCount: 0,
        }

        if(exhaustive){
            const eventCount = await Event.countDocuments({hostingId: org._id, start_time: {$gte: new Date()}, status: { $in: ["approved", "not-applicable"] }});
            exhaustiveData.eventCount = eventCount;
        console.log(exhaustiveData);
        }
        const orgMembers = await OrgMember.find({ org_id: org._id }).populate(
            "user_id"
        );
        const orgFollowers = await OrgFollower.find({ org_id: org._id }).populate(
            "user_id"
        );
        //check if the user has applied to the org
        const user = await User.findById(req.user.userId);
        const existingApplication = await OrgMemberApplication.findOne({org_id: org._id, user_id: user._id, status: "pending"});
        console.log(orgMembers)
        const isMember = orgMembers.some(member => member.user_id._id.toString() === user._id.toString());
        const isFollower = orgFollowers.some(follower => follower.user_id._id.toString() === user._id.toString());
        const isPending = existingApplication ? true : false;

        // If the org exists, return it
        console.log(`GET: /get-org-by-name/${orgName}`);
        res.json({
            success: true,
            message: "Org found",
            org: {
                overview: org,
                members: orgMembers,
                followers: orgFollowers,
                isMember: isMember,
                isFollower: isFollower,
                isPending: isPending,
            },
            exhaustive: exhaustive ? exhaustiveData : null
        }); 
    } catch (error) {
        // Handle any errors that occur during the process
        console.log(`GET: /get-org-by-name failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error retrieving org data",
                error: error.message,
            });
    }
});

router.post("/create-org", verifyToken, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 }
]), handleMulterError, async (req, res) => {
    const { Org, OrgMember, User, OrgManagementConfig, Form } = getModels(req, "Org", "OrgMember", "User", "OrgManagementConfig", "Form");
    const school = req.school || 'rpi';
    const {
        org_name,
        org_description,
        positions,
        weekly_meeting,
        custom_roles,
        socialLinks,
        requireApprovalForJoin,
        memberForm
    } = req.body;
    const profileFile = req.files?.image?.[0];
    const bannerFile = req.files?.bannerImage?.[0];

    try {
        //Verify user and have their orgs saved under them
        const userId = req.user.userId;
        const user = await User.findById({ _id: userId });
        console.log(user);
        if (!user) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }

        const orgExist = await Org.findOne({ org_name: org_name });
        //Check to verify if the org already exists
        if (orgExist) {
            return res
                .status(400)
                .json({ success: false, message: "Org name already exists" });
        }
        if (isProfane(req.body.org_name)) {
            //Check if Bad Words
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Org name contains inappropriate language",
                });
        }

        const cleanOrgName = clean(org_name); // Sanitize org name and description verify this right
        if (isProfane(org_description)) {
            //Check if Bad Words
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Description contains inappropriate language",
                });
        }

        const cleanOrgDescription = clean(org_description);

        // Check org approval config - new orgs may need pending status
        const config = await OrgManagementConfig.findOne();
        const approvalMode = config?.orgApproval?.mode || 'none';
        const requiresApproval = ['manual', 'auto', 'both'].includes(approvalMode);

        // Prepare default roles (only owner and member)
        const defaultRoles = [
            {
                name: 'owner',
                displayName: 'Owner',
                permissions: ['all'],
                isDefault: false,
                canManageMembers: true,
                canManageRoles: true,
                canManageEvents: true,
                canViewAnalytics: true,
                order: 0,
                color: '#dc2626'
            },
            {
                name: 'member',
                displayName: 'Member',
                permissions: ['view_events'],
                isDefault: true,
                canManageMembers: false,
                canManageRoles: false,
                canManageEvents: false,
                canViewAnalytics: false,
                order: 1,
                color: '#6b7280'
            }
        ];

        // Start with default roles
        let allRoles = [...defaultRoles];
        let nextOrder = defaultRoles.length;

        // Parse and merge custom roles if provided
        if (custom_roles) {
            try {
                const parsedCustomRoles = JSON.parse(custom_roles);
                if (Array.isArray(parsedCustomRoles)) {
                    // Add custom roles with proper order
                    parsedCustomRoles.forEach((customRole) => {
                        const roleWithOrder = {
                            ...customRole,
                            order: nextOrder++,
                            isDefault: false
                        };
                        // Ensure color is set (use default if not provided)
                        if (!roleWithOrder.color) {
                            roleWithOrder.color = '#a855f7'; // Default purple for custom roles
                        }
                        allRoles.push(roleWithOrder);
                    });
                }
            } catch (error) {
                console.error('Error parsing custom roles:', error);
                // Continue with default roles only if parsing fails
            }
        }

        // Parse social links if provided
        let parsedSocialLinks = [];
        if (socialLinks) {
            try {
                parsedSocialLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;
                if (!Array.isArray(parsedSocialLinks)) {
                    parsedSocialLinks = [];
                }
            } catch (error) {
                console.error('Error parsing social links:', error);
                parsedSocialLinks = [];
            }
        }

        const newOrg = new Org({
            org_name: cleanOrgName,
            org_description: cleanOrgDescription,
            positions: allRoles,
            weekly_meeting: weekly_meeting || null,
            socialLinks: parsedSocialLinks,
            owner: userId,
            approvalStatus: requiresApproval ? 'pending' : 'approved',
            requireApprovalForJoin: requireApprovalForJoin === 'true' || requireApprovalForJoin === true,
        });

        // Handle profile image upload if file is present
        if (profileFile) {
            console.log('Uploading profile image');
            const fileExtension = path.extname(profileFile.originalname);
            const fileName = `${newOrg._id}${fileExtension}`;
            const imageUrl = await uploadImageToS3(profileFile, 'orgs', fileName);
            newOrg.org_profile_image = imageUrl;
        } else {
            // Set default image if no file uploaded
            newOrg.org_profile_image = '/Logo.svg';
        }

        // Handle banner image upload if file is present
        if (bannerFile) {
            console.log('Uploading banner image');
            const fileExtension = path.extname(bannerFile.originalname);
            const fileName = `${newOrg._id}_banner${fileExtension}`;
            const bannerUrl = await uploadImageToS3(bannerFile, 'orgs', fileName);
            newOrg.org_banner_image = bannerUrl;
        }

        const newMember = new OrgMember({
            //add new member to the org
            org_id: newOrg._id,
            user_id: userId,
            role: 'owner', // Set the creator as owner
            status: 'active',
            assignedBy: userId
        });

        await newMember.save();

        user.clubAssociations.push(newOrg._id);
        await user.save();

        // Create member form if provided
        if (memberForm) {
            try {
                const formObject = typeof memberForm === 'string' ? JSON.parse(memberForm) : memberForm;
                const formWithMeta = {
                    ...formObject,
                    title: formObject.title || 'Member Application Form',
                    description: formObject.description || 'Prospective members will need to fill out this form.',
                    questions: formObject.questions || [],
                    createdBy: userId,
                    createdType: 'User',
                    formOwner: newOrg._id,
                    formOwnerType: 'Org'
                };
                const newForm = new Form(formWithMeta);
                await newForm.save();
                newOrg.memberForm = newForm._id;
            } catch (formError) {
                console.error('Error creating member form:', formError);
                // Continue without form - org is already created
            }
        }

        const saveOrg = await newOrg.save(); //Save the org

        // If manual approval is on, email all admin users about the new org
        if (requiresApproval && (approvalMode === 'manual' || approvalMode === 'both')) {
            try {
                const adminUsers = await User.find({
                    roles: { $in: ['admin', 'root'] },
                    email: { $exists: true, $ne: '' }
                })
                    .select('email name username')
                    .lean();

                console.log(adminUsers);

                if (adminUsers.length > 0 && process.env.RESEND_API_KEY) {
                    const baseUrl = process.env.NODE_ENV === 'production'
                        ? `https://${school}.meridian.study`
                        : 'http://localhost:3000';
                    const approvalUrl = `${baseUrl}/org-management`;

                    const adminEmails = adminUsers.map(u => u.email).filter(Boolean);
                    const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    const safeOrgName = escapeHtml(cleanOrgName);
                    const safeDescription = escapeHtml(cleanOrgDescription.substring(0, 200) + (cleanOrgDescription.length > 200 ? '...' : ''));
                    const emailHTML = `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #1f2937;">New organization awaiting approval</h2>
                            <p>A new organization has been created and is pending approval:</p>
                            <p><strong>${safeOrgName}</strong></p>
                            <p>${safeDescription}</p>
                            <p><a href="${approvalUrl}" style="display: inline-block; padding: 12px 24px; background: #6d8efa; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Review and approve</a></p>
                            <p style="color: #6b7280; font-size: 14px;">This is an automated message from Meridian.</p>
                        </div>
                    `;

                    // Fire-and-forget: don't block the response on Resend's API
                    resend.emails.send({
                        from: 'Meridian <support@meridian.study>',
                        to: adminEmails,
                        subject: `New organization "${cleanOrgName}" needs approval`,
                        html: emailHTML,
                    }).then(({ data, error }) => {
                        if (error) {
                            console.error('POST: /create-org - Resend API error:', error);
                        } else {
                            console.log(`POST: /create-org - Notified ${adminEmails.length} admin(s) about pending org`, data?.id ? `(id: ${data.id})` : '');
                        }
                    }).catch((err) => {
                        console.error('POST: /create-org - Failed to send admin notification email:', err);
                    });
                }
            } catch (emailError) {
                console.error('POST: /create-org - Failed to send admin notification email:', emailError);
                // Don't fail org creation if email fails
            }
        }

        console.log(`POST: /create-org`);
        return res
            .status(200)
            .json({
                success: true,
                message: "Org created successfully",
                org: saveOrg,
            });
    } catch (error) {
        // Handle any errors that occur during the process
        console.log(`POST: /create-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error creating org",
                error: error.message,
            });
    }
});
//add org perms
router.post("/edit-org", verifyToken, upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'bannerImage', maxCount: 1 }
]), handleMulterError, async (req, res) => {
    const { Org, Form } = getModels(req, "Org", "Form");
    try {
        const {
            orgId,
            org_profile_image,
            org_banner_image,
            org_description,
            positions,
            weekly_meeting,
            org_name,
            requireApprovalForJoin,
            memberForm,
            socialLinks,
            unlisted,
        } = req.body;
        const userId = req.user?.userId;
        const profileFile = req.files?.image?.[0];
        const bannerFile = req.files?.bannerImage?.[0];

        // Validate that the essential fields are present
        if (!orgId) {
            return res
                .status(400)
                .json({ success: false, message: "Org ID is required" });
        }

        const org = await Org.findById(orgId);

        // Check if the org exists
        console.log;
        if (!org) {
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        // Check if the user is authorized to edit the org
        if (org.owner.toString() !== userId) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "You are not authorized to edit this org",
                });
        }

        // If org_name is provided, clean it and check for inappropriate language
        if (org_name) {
            const cleanOrgName = clean(org_name);

            if (isProfane(org_name)) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Org name contains inappropriate language",
                    });
            }

            // Check if a org with the cleaned name already exists, excluding the current org
            const orgExist = await Org.findOne({ org_name: cleanOrgName });
            if (orgExist && orgExist._id.toString() !== orgId) {
                return res
                    .status(400)
                    .json({ success: false, message: "Org name already taken" });
            }

            // Update the org name with the clean version
            org.org_name = cleanOrgName;
        }

        // If org_description is provided, clean it
        if (org_description) {
            const cleanOrgDescription = clean(org_description);

            if (isProfane(org_description)) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message: "Description contains inappropriate language",
                    });
            }
            org.org_description = cleanOrgDescription;
        }

        // Handle profile image upload if file is present
        if (profileFile) {
            console.log('Uploading new profile image');
            const fileExtension = path.extname(profileFile.originalname);
            const fileName = `${org._id}_profile${fileExtension}`;
            const imageUrl = await uploadImageToS3(profileFile, 'orgs', fileName);
            org.org_profile_image = imageUrl;
        } else if (org_profile_image) {
            org.org_profile_image = org_profile_image;
        }

        // Handle banner image upload if file is present
        if (bannerFile) {
            console.log('Uploading new banner image');
            const fileExtension = path.extname(bannerFile.originalname);
            const fileName = `${org._id}_banner${fileExtension}`;
            const bannerUrl = await uploadImageToS3(bannerFile, 'orgs', fileName);
            org.org_banner_image = bannerUrl;
        } else if (org_banner_image !== undefined) {
            // Only update if explicitly provided (allows clearing banner by sending empty string)
            org.org_banner_image = org_banner_image || null;
        }

        // Update other fields only if they are provided
        if (positions) {
            try {
                // Parse positions if it's a JSON string
                const parsedPositions = typeof positions === 'string' ? JSON.parse(positions) : positions;
                org.positions = parsedPositions;
            } catch (error) {
                console.error('Error parsing positions:', error);
                return res.status(400).json({
                    success: false,
                    message: "Invalid positions data format"
                });
            }
        }
        if (requireApprovalForJoin) {
            org.requireApprovalForJoin = requireApprovalForJoin;
        }
        if (memberForm) {
            console.log(memberForm);
            const formObject = typeof memberForm === 'string' ? JSON.parse(memberForm) : memberForm;
            if(org.memberForm) {
                await Form.findByIdAndUpdate(org.memberForm, formObject);
            } else {
                const formWithMeta = {
                    ...formObject,
                    title: formObject.title || 'Member Application Form',
                    description: formObject.description || 'Prospective members will need to fill out this form.',
                    questions: formObject.questions || [],
                    createdBy: userId,
                    createdType: 'User',
                    formOwner: org._id,
                    formOwnerType: 'Org'
                };
                const newForm = new Form(formWithMeta);
                await newForm.save();
                org.memberForm = newForm._id;
            }
        }
        if (weekly_meeting) {
            org.weekly_meeting = weekly_meeting;
        }
        if (unlisted !== undefined) {
            org.unlisted = unlisted === true || unlisted === 'true';
        }
        if (socialLinks !== undefined) {
            try {
                // Parse socialLinks if it's a JSON string
                const parsedSocialLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;
                // Validate social links structure
                if (Array.isArray(parsedSocialLinks)) {
                    // Validate each link
                    for (const link of parsedSocialLinks) {
                        if (!link.type || !['instagram', 'youtube', 'tiktok', 'website'].includes(link.type)) {
                            return res.status(400).json({
                                success: false,
                                message: "Invalid social link type"
                            });
                        }
                        if (link.type === 'website') {
                            if (!link.url || !link.title) {
                                return res.status(400).json({
                                    success: false,
                                    message: "Website links must have both url and title"
                                });
                            }
                        } else {
                            if (!link.username) {
                                return res.status(400).json({
                                    success: false,
                                    message: `Social media link (${link.type}) must have a username`
                                });
                            }
                        }
                    }
                    org.socialLinks = parsedSocialLinks;
                }
            } catch (error) {
                console.error('Error parsing socialLinks:', error);
                return res.status(400).json({
                    success: false,
                    message: "Invalid socialLinks data format"
                });
            }
        }

        // Save the updated org
        await org.save();

        // Send success response
        console.log(`POST: /edit-org`);
        res.json({ success: true, message: "Org updated successfully", org });
    } catch (error) {
        // Handle any errors that occur during the process
        console.log(`POST: /edit-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error updating org",
                error: error.message,
            });
    }
});

// Candidate: no direct frontend references found; verify before deprecating
router.delete("/delete-org/:orgId", verifyToken, requireOrgOwner('orgId'), async (req, res) => {
    const { Org, Event } = getModels(req, "Org", "Event");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;
        const org = req.org;

        // Already soft-deleted
        if (org.isDeleted) {
            return res.status(400).json({ success: false, message: "Org is already deleted" });
        }

        const now = new Date();
        org.isDeleted = true;
        org.deletedAt = now;
        org.deletedBy = userId;
        await org.save();

        // Soft delete all events hosted by this org
        const eventResult = await Event.updateMany(
            { hostingId: orgId, hostingType: "Org" },
            { $set: { isDeleted: true, deletedAt: now } }
        );

        console.log(`DELETE: /delete-org (soft) - org ${orgId}, ${eventResult.modifiedCount} events soft-deleted`);
        res.json({ success: true, message: "Org deleted successfully" });
    } catch (error) {
        console.log(`DELETE: /delete-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error deleting org",
                error: error.message,
            });
    }
});

router.post("/follow-org/:orgId", verifyToken, async (req, res) => {
    const { Org, OrgFollower } = getModels(req, "Org", "OrgFollower");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;

        const org = await Org.findById(orgId);

        //Check if the org exists
        if (!org) {
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        const alreadyFollowing = await OrgFollower.findOne({
            user_id: userId,
            org_id: orgId,
        }); //Check if the user is already following the org
        if (alreadyFollowing) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "You are already following this org",
                });
        }

        const newFollower = new OrgFollower({
            user_id: userId,
            org_id: orgId,
        });
        await newFollower.save();

        console.log(`POST: /follow-org`);
        res.json({ success: true, message: "Org followed successfully" });
    } catch (error) {
        console.log(`POST: /follow-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error following org",
                error: error.message,
            });
    }
});

router.post("/unfollow-org/:orgId", verifyToken, async (req, res) => {
    const { Org, OrgFollower } = getModels(req, "Org", "OrgFollower");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;

        const org = await Org.findById(orgId);

        //Check if the org exists
        if (!org) {
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        const follower = await OrgFollower.findOne({ user_id: userId, org_id: orgId }); //Check if the user is already following the org
        if (!follower) {
            return res
                .status(400)
                .json({ success: false, message: "You are not following this org" });
        }

        await OrgFollower.findByIdAndDelete(follower._id);

        console.log(`POST: /unfollow-org`);
        res.json({ success: true, message: "Org unfollowed successfully" });
    } catch (error) {
        console.log(`POST: /unfollow-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error unfollowing org",
                error: error.message,
            });
    }
});

router.get("/get-followed-orgs", verifyToken, async (req, res) => {
    const { OrgFollower } = getModels(req, "OrgFollower");
    try {
        const userId = req.user.userId;

        const followedOrgs = await OrgFollower.find({ user_id: userId }).populate(
            "org_id"
        );
        console.log(`GET: /get-followed-orgs`);
        res.json({
            success: true,
            message: "Followed orgs retrieved successfully",
            orgs: followedOrgs,
        });
    } catch (error) {
        console.log(`GET: /get-followed-orgs failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error retrieving followed orgs",
                error: error.message,
            });
    }
});

// UNUSED: Replaced by /org-roles/:orgId/members
router.get("/get-org-members/:orgId", verifyToken, async (req, res) => {
    const { Org, OrgMember } = getModels(req, "Org", "OrgMember");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;

        const org = await Org.findById(orgId);

        //Check if the org exists
        if (!org) {
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        // Check if the user is a member of the org
        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (!member) {
            return res
                .status(400)
                .json({ success: false, message: "You are not a member of this org" });
        }

        const members = await OrgMember.find({ org_id: orgId }).populate("user_id");
        console.log(`GET: /get-org-members`);
        res.json({
            success: true,
            message: "Org members retrieved successfully",
            members,
        });
    } catch (error) {
        console.log(`GET: /get-org-members failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error retrieving org members",
                error: error.message,
            });
    }
});

// Candidate: No direct frontend references found; verify if still needed with new membership flows
router.post("/:orgId/apply-to-org", verifyToken, async (req, res) => {
    const { Org, OrgMemberApplication, FormResponse, Form, User, Notification, OrgMember } = getModels(req, "Org", "OrgMemberApplication", "FormResponse", "Form", "User", "Notification", "OrgMember");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;
        const { formResponse } = req.body;

        const org = await Org.findById(orgId);
        if(!org) return res.status(404).json({success: false, message: "Org not found"});
        
        if(org.requireApprovalForJoin) {
            const existingApplication = await OrgMemberApplication.findOne({org_id: orgId, user_id: userId, status: "pending"});
            if(existingApplication) return res.status(400).json({success: false, message: "You have already applied to this org"});
        } else {
            const newMember = new OrgMember({
                org_id: orgId,
                user_id: userId,
                role: 'member',
            });
            await newMember.save();
            // Check auto-approve for org (Atlas: when member count reaches threshold)
            const { checkAndAutoApproveOrg } = require('../services/orgApprovalService');
            await checkAndAutoApproveOrg(req, orgId);
            res.status(200).json({success: true, message: "You are now a member of this org"});
            return;
        }
        
        if(org.memberForm) {
            const form = await Form.findById(org.memberForm);
            if(!form) return res.status(404).json({success: false, message: "Form not found"});
            
            // Create answers array in the same order as questions
            const answers = form.questions.map(question => {
                const response = formResponse.find(r => r.referenceId === question._id.toString());
                return response ? response.answer : null;
            });
            
            const formResponseObject = await FormResponse.create({
                form: form._id,
                formSnapshot: form.toObject(), // Store the complete form object
                submittedBy: userId,
                answers: answers,
                submittedAt: new Date(),
                lastModifiedAt: new Date(),
            });
            if(!formResponseObject) return res.status(400).json({success: false, message: "Error submitting form"});
            //check if the user has already applied to the org
            //create a new application
            const newApplication = new OrgMemberApplication({
                org_id: orgId,
                user_id: userId,
                formResponse: formResponseObject._id,
            });
            await newApplication.save();
        } else {
            const newApplication = new OrgMemberApplication({
                org_id: orgId,
                user_id: userId,
            });
            await newApplication.save();
        }

        // Send notification to org admins about the new member
        const orgAdmins = await OrgMember.find({ 
            org_id: orgId, 
            role: { $in: ['owner', 'admin'] } 
        });
        console.log('orgAdmins', orgAdmins);

        const user = await User.findById(userId);
        
        if (orgAdmins.length > 0) {
            const notificationService = NotificationService.withModels({ Notification });
            const recipients = orgAdmins.map(admin => ({
                id: admin.user_id,
                model: 'User'
            }));
            
            await notificationService.createBatchTemplateNotification(recipients, 'org_member_applied', {
                senderName: user.name || user.username,
                orgName: org.org_name,
                sender: user._id,
            });
            
            // Legacy direct notification path removed; handled via template above
        }
        res.status(200).json({success: true, message: "Application submitted successfully"});
    } catch (error) {
        console.log(`POST: /apply-to-org failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error applying to org",
                error: error.message,
            });
    }
});


// UNUSED: Superseded by DELETE /org-roles/:orgId/members/:userId

// Leave organization (self-removal)
router.post("/leave-org/:orgId", verifyToken, async (req, res) => {
    const { Org, OrgMember } = getModels(req, "Org", "OrgMember");
    try {
        const { orgId } = req.params;
        const userId = req.user.userId;

        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({ success: false, message: "Org not found" });
        }

        // Check if user is the owner
        if (org.owner.toString() === userId) {
            return res.status(400).json({
                success: false,
                message: "Organization owner cannot leave. Please transfer ownership first."
            });
        }

        const member = await OrgMember.findOne({ org_id: orgId, user_id: userId });
        if (!member) {
            return res.status(400).json({
                success: false,
                message: "You are not a member of this organization"
            });
        }

        await OrgMember.deleteOne({ _id: member._id });

        console.log(`POST: /leave-org/${orgId}`);
        res.json({ success: true, message: "You have left the organization successfully" });
    } catch (error) {
        console.log(`POST: /leave-org failed`, error);
        return res.status(500).json({
            success: false,
            message: "Error leaving organization",
            error: error.message,
        });
    }
});

router.post("/check-org-name", verifyToken, async (req, res) => {
    const { Org } = getModels(req, "Org");
    const { orgName } = req.body;
    try {
        if (orgName.length === 0) {
            return res
                .status(400)
                .json({ success: false, message: "Org name is required" });
        }
        if (isProfane(orgName)) {
            return res
                .status(400)
                .json({
                    success: false,
                    message: "Org name contains inappropriate language",
                });
        }
        const cleanOrgName = clean(orgName);
        const orgExist = await Org.findOne({ org_name: cleanOrgName });
        if (orgExist) {
            return res
                .status(402)
                .json({ success: false, message: "Org name already exists" });
        }
        console.log(`POST: /org-name-check`);
        return res.json({ success: true, message: "Org name is available" });
    } catch (error) {
        console.log("POST: /org-name-check failed", error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error checking org name",
                error: error.message,
            });
    }
});

router.get('/get-meetings/:name', verifyToken, async(req,res)=>{
    const { Org, Event } = getModels(req, "Org", "Event");
    const name = req.params.name;
    try {
        const org = await Org.findOne({ org_name: name });
        if(!org) return res.status(404).json({ success: false, message: 'Org not found' });
        const events = await Event.find({ hostingId: org._id, hostingType: 'Org', type: "meeting" });
        console.log(`GET: /get-meetings`);
        res.json({
            success: true,
            message: "Meetings retrieved successfully",
            events,
        });
    } catch (error) {
        console.log(`GET: /get-meetings failed`, error);
        return res
            .status(500)
            .json({
                success: false,
                message: "Error retrieving meetings",
                error: error.message,
            });
    }
});

// UNUSED/DEV: Sample email sender route
router.post('/send-email', async (req,res) => {
    try{
        
        const emailHTML = await render(React.createElement(ForgotEmail, { name: "James", link: "https://study-compass.com" }));

        const { data, error } = await resend.emails.send({
            from: "Study Compass <support@study-compass.com>",
            to: ["jbliu02@gmail.com"],
            subject: "hello world",
            html: emailHTML,
          });
        if(error){
            console.log('POST: email sending error', error);
            return res.status(500).json({ success: false, message: 'Error sending email', error: error.message });
        }
        res.status(200).json({ success: true, message: 'Email sent successfully', data });
    } catch (error){
        console.log('POST: email sending error');
        res.status(500).json({ success: false, message: 'Error sending email', error: error.message });
    }
});

router.get('/get-orgs', verifyTokenOptional, async (req, res) => {
    try {
        const { exhaustive, includePending } = req.query;
        const { Org, OrgMember, OrgFollower, Event } = getModels(req, 'Org', 'OrgMember', 'OrgFollower', 'Event');
        const userId = req.user?.userId;

        // Atlas: Default filter - only approved orgs for discoverability. includePending + auth = add user's orgs.
        const baseApprovalFilter = {
            $or: [
                { approvalStatus: 'approved' },
                { approvalStatus: { $exists: false } }
            ]
        };
        let approvalFilter = baseApprovalFilter;
        if (includePending === 'true' && userId) {
            const userOrgIds = await OrgMember.find({ user_id: userId, status: 'active' })
                .distinct('org_id');
            const userOwnedOrgIds = await Org.find({ owner: userId }).distinct('_id');
            const allUserOrgIds = [...new Set([
                ...userOrgIds.map(id => id.toString()),
                ...userOwnedOrgIds.map(id => id.toString())
            ])].map(id => new mongoose.Types.ObjectId(id));
            approvalFilter = {
                $or: [
                    baseApprovalFilter,
                    { _id: { $in: allUserOrgIds } }
                ]
            };
        }

        // Exclude unlisted orgs from the public Organizations list
        const unlistedFilter = { unlisted: { $ne: true } };

        //if exhaustive, return org stats like memberCount, followerCount, eventCount, using aggregate using efficeint query
        if (exhaustive) {
            const orgs = await Org.aggregate([
                { $match: { ...approvalFilter, ...unlistedFilter, isDeleted: { $ne: true } } },
                // Lookup members and count them (only active members)
                {
                    $lookup: {
                        from: 'members', // Collection name for OrgMember
                        let: { orgId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$org_id', '$$orgId'] },
                                            { $eq: ['$status', 'active'] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'members'
                    }
                },
                // Lookup followers and count them
                {
                    $lookup: {
                        from: 'followers', // Collection name for OrgFollower
                        localField: '_id',
                        foreignField: 'org_id',
                        as: 'followers'
                    }
                },
                // Lookup events and count them
                {
                    $lookup: {
                        from: 'events', // Collection name for Event
                        let: { orgId: '$_id' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ['$hostingId', '$$orgId'] },
                                            { $eq: ['$hostingType', 'Org'] },
                                            { $ne: ['$isDeleted', true] }
                                        ]
                                    }
                                }
                            }
                        ],
                        as: 'events'
                    }
                },
                // Project the counts
                {
                    $project: {
                        _id: 1,
                        org_name: 1,
                        org_profile_image: 1,
                        org_banner_image: 1,
                        org_description: 1,
                        positions: 1,
                        owner: 1,
                        verified: 1,
                        verificationType: 1,
                        verificationStatus: 1,
                        memberCount: { $size: '$members' },
                        followerCount: { $size: '$followers' },
                        eventCount: { $size: '$events' }
                    }
                }
            ]);
            console.log('orgs', orgs[0]);
            return res.status(200).json({
                success: true,
                orgs: orgs
            });
        }
        const orgs = await Org.find({ ...approvalFilter, ...unlistedFilter });
        res.status(200).json({
            success: true,
            orgs
        });
    } catch (error){
        console.log('GET: /get-orgs failed', error);
        res.status(500).json({
            sucess:false,
            message: error.message
        })
    }
});

router.get('/:orgId/events', verifyToken, async (req, res) => {
    const { Event, OrgMember } = getModels(req, 'Event', 'OrgMember');
    try {
        const { orgId } = req.params;
        const { page = 1, limit = 15 } = req.query;
        const userId = req.user?.userId;
        
        const skip = (page - 1) * limit;
        
        // Visibility: exclude unlisted; for members_only, only show to org members
        const isOrgMember = userId ? await OrgMember.findOne({ org_id: orgId, user_id: userId, status: 'active' }) : null;
        const visibilityFilter = {
            visibility: { $ne: 'unlisted' },
            $or: [
                { visibility: { $ne: 'members_only' } },
                ...(isOrgMember ? [{ visibility: 'members_only' }] : [])
            ]
        };
        
        // Find events hosted by this organization
        const events = await Event.find({
            hostingId: orgId,
            hostingType: 'Org',
            start_time: { $gte: new Date() },
            status: { $in: ['approved', 'not-applicable'] },
            isDeleted: false,
            ...visibilityFilter
        })
        .sort({ start_time: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('hostingId');

        console.log(events);
        
        const totalEvents = await Event.countDocuments({
            hostingId: orgId,
            hostingType: 'Org',
            start_time: { $gte: new Date() },
            status: { $in: ['approved', 'not-applicable'] },
            isDeleted: false,
            ...visibilityFilter
        });
        
        console.log(`GET: /${orgId}/events`);
        res.json({
            success: true,
            message: "Org events retrieved successfully",
            events,
            hasMore: events.length === parseInt(limit),
            total: totalEvents
        });
    } catch (error) {
        console.log(`GET: /${req.params.orgId}/events failed`, error);
        return res.status(500).json({
            success: false,
            message: "Error retrieving org events",
            error: error.message,
        });
    }
});

router.post('/:orgId/create-member-form', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { form, orgId } = req.body;
    try{
        const newForm = new Form({
            ...form,
            createdBy: orgId,
            createdType: 'Org',
            formOwner: orgId,
            formOwnerType: 'Org'
        });
        await newForm.save();
        const org = await Org.findOneAndUpdate({_id: orgId}, {$set: {memberForm: newForm._id}});
        if(!org) return res.status(404);
        console.log('POST: /create-member-form successful');
        return res.status(200).json({success:true, message: "Form created"});
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

router.post('/:orgId/edit-member-form', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { formId, form } = req.body;
    try{
        const form = await Form.findByIdAndUpdate(formId, form);
        if(!form) return res.status(404);      
        console.log('POST: /edit-member-form successful');
        return res.status(200).json({success:true, message: "Form updated"});
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
})

// Create a new form for the organization
router.post('/:orgId/forms', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { orgId } = req.params;
    const { form } = req.body;
    
    try {
        // Verify organization exists
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Add organization and user context to the form
        const formData = {
            ...form,
            createdBy: req.user.userId,
            createdType: 'User',
            formOwner: orgId,
            formOwnerType: 'Org'
        };

        // Remove temporary IDs from questions
        const processedForm = {
            ...formData,
            questions: formData.questions.map(q => {
                if (q._id && q._id.startsWith('NEW_QUESTION_')) {
                    const { _id, ...questionWithoutId } = q;
                    return questionWithoutId;
                }
                return q;
            })
        };

        const newForm = new Form(processedForm);
        await newForm.save();

        console.log('POST: /:orgId/forms successful');
        return res.status(200).json({
            success: true,
            message: "Form created successfully",
            form: newForm
        });
    } catch (error) {
        console.log('Error creating form:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update a form for the organization
router.put('/:orgId/forms/:formId', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org, Form } = getModels(req, 'Org', 'Form');
    const { orgId, formId } = req.params;
    const { form } = req.body;
    
    try {
        // Verify organization exists
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Verify form exists and belongs to organization
        const existingForm = await Form.findOne({
            _id: formId,
            formOwner: orgId,
            formOwnerType: 'Org'
        });

        if (!existingForm) {
            return res.status(404).json({
                success: false,
                message: 'Form not found or access denied'
            });
        }

        // Remove temporary IDs from questions
        const processedForm = {
            ...form,
            questions: form.questions.map(q => {
                if (q._id && q._id.startsWith('NEW_QUESTION_')) {
                    const { _id, ...questionWithoutId } = q;
                    return questionWithoutId;
                }
                return q;
            })
        };

        const updatedForm = await Form.findByIdAndUpdate(
            formId,
            { ...processedForm, updatedAt: Date.now() },
            { new: true }
        );

        console.log('PUT: /:orgId/forms/:formId successful');
        return res.status(200).json({
            success: true,
            message: "Form updated successfully",
            form: updatedForm
        });
    } catch (error) {
        console.log('Error updating form:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// // Get all forms for the organization
// router.get('/:orgId/forms', verifyToken, requireMemberManagement(), async (req, res) => {
//     const { Form } = getModels(req, 'Form');
//     const { orgId } = req.params;
    
//     try {
//         const forms = await Form.find({
//             formOwner: orgId,
//             formOwnerType: 'Org'
//         }).sort({ createdAt: -1 });

//         console.log('GET: /:orgId/forms successful');
//         return res.status(200).json({
//             success: true,
//             forms: forms
//         });
//     } catch (error) {
//         console.log('Error retrieving forms:', error);
//         res.status(500).json({
//             success: false,
//             message: error.message
//         });
//     }
// });

// Update approval settings for approval groups
router.post('/:orgId/approval-settings', verifyToken, requireMemberManagement(), async (req, res) => {
    const { Org } = getModels(req, 'Org');
    const { orgId } = req.params;
    const { approvalSettings } = req.body;
    
    try {
        const org = await Org.findById(orgId);
        if (!org) {
            return res.status(404).json({
                success: false,
                message: 'Organization not found'
            });
        }

        // Check if this is an approval group
        if (org.approvalSettings.type !== 'approval_group') {
            return res.status(400).json({
                success: false,
                message: 'This organization is not an approval group'
            });
        }

        // Update approval settings
        org.approvalSettings = {
            ...org.approvalSettings,
            ...approvalSettings
        };

        await org.save();

        console.log('POST: /approval-settings successful');
        return res.status(200).json({
            success: true,
            message: 'Approval settings updated successfully',
            data: org.approvalSettings
        });
    } catch (error) {
        console.log('POST: /approval-settings failed', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating approval settings',
            error: error.message
        });
    }
})

router.get('/:orgId/forms', verifyToken, async (req, res) => {
    const { Form } = getModels(req, 'Form');
    const { orgId } = req.params;
    try{
        const forms = await Form.find({formOwner: orgId, formOwnerType: 'Org'});
        console.log('GET: /forms successful');
        res.status(200).json({success: true, forms});
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
