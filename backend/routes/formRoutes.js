const express = require("express");
const router = express.Router();
const {
    verifyToken,
    verifyTokenOptional,
} = require("../middlewares/verifyToken.js");
const getModels = require("../services/getModelService.js");



router.get("/get-form-by-id/:id", verifyTokenOptional, async (req, res) => {
    try{
        const { Form, FormResponse, User, Org } = getModels(req, "Form", "FormResponse", "User", "Org");
        const formId = req.params.id;
        const userId = req.user?.userId;
        
        const form = await Form.findById(formId)
            .populate('createdBy', 'name email')
            .lean();
            
        if(!form) return res.status(404).json({ success: false, message: "Form not found" });
        
        // Get form owner info
        let ownerInfo = null;
        if (form.formOwnerType === 'Org') {
            const org = await Org.findById(form.formOwner).select('org_name').lean();
            ownerInfo = org ? { name: org.org_name, type: 'Org' } : null;
        } else if (form.formOwnerType === 'User') {
            const user = await User.findById(form.formOwner).select('name email').lean();
            ownerInfo = user ? { name: user.name || user.email, email: user.email, type: 'User' } : null;
        }
        
        // Check if user has already submitted (if allowMultipleResponses is false and user is authenticated)
        let hasSubmitted = false;
        if (userId && !form.allowMultipleResponses) {
            const existingResponse = await FormResponse.findOne({
                form: formId,
                submittedBy: userId
            }).lean();
            hasSubmitted = !!existingResponse;
        }
        
        res.status(200).json({ 
            success: true, 
            form: form,
            ownerInfo: ownerInfo,
            hasSubmitted: hasSubmitted,
            isAuthenticated: !!userId
        });
    } catch(error){
        console.log(error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// ---- SUBMIT FORM RESPONSE ----
router.post("/submit-form-response", verifyTokenOptional, async (req, res) => {
    try {
        const { formId, responses, guestName, guestEmail } = req.body;
        const { Form, FormResponse } = getModels(req, "Form", "FormResponse");
        const userId = req.user?.userId;

        console.log("Form submission request:", { formId, responsesCount: responses?.length, userId });

        if (!formId || !responses) {
            return res.status(400).json({ success: false, message: "Missing formId or responses" });
        }

        // Make sure the form exists
        const form = await Form.findById(formId);
        if (!form) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        // Check if form is accepting responses
        if (form.acceptingResponses === false) {
            return res.status(400).json({ 
                success: false, 
                message: "This form is no longer accepting responses" 
            });
        }

        // Anonymous submission: require allowAnonymous, check collectGuestDetails
        if (!userId) {
            if (!form.allowAnonymous) {
                return res.status(401).json({ 
                    success: false, 
                    message: "Authentication required to submit this form",
                    code: "AUTH_REQUIRED"
                });
            }
            if (form.collectGuestDetails !== false) {
                if (!guestName || !guestEmail) {
                    return res.status(400).json({ 
                        success: false, 
                        message: "Name and email are required for anonymous submissions" 
                    });
                }
            }
        }

        // Authenticated: require auth when form.requireAuth
        if (form.requireAuth && !userId) {
            return res.status(401).json({ 
                success: false, 
                message: "Authentication required to submit this form",
                code: "AUTH_REQUIRED"
            });
        }

        // Check if user has already submitted (if multiple responses not allowed)
        if (!form.allowMultipleResponses && userId) {
            const existingResponse = await FormResponse.findOne({
                form: formId,
                submittedBy: userId
            });
            if (existingResponse) {
                return res.status(400).json({ 
                    success: false, 
                    message: "You have already submitted a response to this form" 
                });
            }
        }

        console.log("Form found:", form.title, "Questions:", form.questions.length);

        // Convert responses array to answers array in the same order as questions
        // responses format: [{ referenceId, answer, question, type }, ...]
        // answers format: [answer1, answer2, ...] in order of questions
        const answers = form.questions.map((question, index) => {
            const response = responses.find(r => {
                // Try to match by referenceId (string comparison)
                const questionIdStr = question._id.toString();
                const responseIdStr = r.referenceId?.toString();
                return questionIdStr === responseIdStr;
            });
            if (!response) {
                console.log(`No response found for question ${index + 1}: ${question.question}`);
            }
            return response ? response.answer : null;
        });

        console.log("Converted answers:", answers.length, "answers");

        // Build FormResponse document
        const formResponseData = {
            formSnapshot: form.toObject(),
            form: formId,
            answers: answers,
            submittedAt: new Date()
        };

        if (userId) {
            formResponseData.submittedBy = userId;
        } else {
            formResponseData.submittedBy = null;
            if (form.collectGuestDetails !== false) {
                formResponseData.guestName = guestName;
                formResponseData.guestEmail = guestEmail;
            }
        }

        const formResponse = new FormResponse(formResponseData);

        await formResponse.save();

        console.log("Form response saved successfully:", formResponse._id);

        res.status(201).json({ success: true, message: "Form response submitted", formResponse });
    } catch (error) {
        console.error("Error submitting form response:", error);
        console.error("Error stack:", error.stack);
        res.status(500).json({ 
            success: false, 
            message: "Internal server error", 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ---- GET FORM RESPONSES FOR ORG DASHBOARD ----
// This route must come after the more specific routes above
router.get("/form/:formId/responses", verifyToken, async (req, res) => {
    try {
        const { Form, FormResponse, OrgMember } = getModels(req, "Form", "FormResponse", "OrgMember");
        const formId = req.params.formId;
        const userId = req.user?.userId;

        // Fetch form to ensure it exists and get org
        const form = await Form.findById(formId).lean();
        if (!form) {
            return res.status(404).json({ success: false, message: "Form not found" });
        }

        // Check if form belongs to an org and user has permission
        if (form.formOwnerType === 'Org') {
            const orgId = form.formOwner;
            // Check if user is a member of the org with admin/owner role
            const orgMember = await OrgMember.findOne({
                org_id: orgId,
                user_id: userId,
            });

            console.log("orgMember", orgMember);

            if (!orgMember) {
                return res.status(403).json({ 
                    success: false, 
                    message: "You do not have permission to view form responses" 
                });
            }
        } else if (form.formOwnerType === 'User') {
            // If form is owned by a user, only that user can see responses
            if (form.formOwner.toString() !== userId) {
                return res.status(403).json({ 
                    success: false, 
                    message: "You do not have permission to view form responses" 
                });
            }
        }

        // Fetch all responses for this form, and populate user fields for dashboard display
        const responses = await FormResponse.find({ form: formId })
            .populate("submittedBy", "name email")
            .sort({ submittedAt: -1 })
            .lean();

        res.status(200).json({ success: true, responses });
    } catch (error) {
        console.error("Error fetching form responses:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});



module.exports = router;