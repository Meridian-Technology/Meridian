"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importDefault(require("react"));
var components_1 = require("@react-email/components");
// Design tokens - matches ForgotEmail & Meridian brand
var styles = {
    container: {
        margin: 0,
        // padding: "30px 0",
        width: "100%",
        minHeight: "100%",
        // backgroundColor: "#F6F6F6",
    },
    card: {
        margin: "0 auto",
        maxWidth: "600px",
        // backgroundColor: "#FFFFFF",
        borderRadius: 8,
        overflow: "hidden",
    },
    content: {
        padding: "24px",
        textAlign: "left",
    },
    title: {
        margin: "0 0 20px 0",
        fontSize: 20,
        lineHeight: "28px",
        fontWeight: 600,
        color: "#1f2937",
    },
    body: {
        fontSize: 16,
        lineHeight: "24px",
        color: "#414141",
        margin: "0 0 16px 0",
    },
    button: {
        backgroundColor: "#6D8EFA",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: 8,
        fontWeight: 600,
        marginTop: 24,
    },
    footer: {
        marginTop: 24,
        fontSize: 14,
        color: "#6b7280",
        lineHeight: "20px",
    },
};
var OrgInviteNewUser = function (_a) {
    var orgName = _a.orgName, orgDescription = _a.orgDescription, role = _a.role, roleDisplayName = _a.roleDisplayName, inviterName = _a.inviterName, signUpUrl = _a.signUpUrl;
    var displayRole = roleDisplayName || role;
    var description = orgDescription || "Join this organization on Meridian to collaborate, manage events, and connect with members.";
    var truncatedDescription = description.length > 300 ? description.substring(0, 300) + "..." : description;
    return (react_1.default.createElement(components_1.Html, { style: { margin: 0, width: "100%" } },
        react_1.default.createElement(components_1.Section, { style: styles.container, className: "email-container" },
            react_1.default.createElement(components_1.Section, { style: styles.card, className: "email-content" },
                react_1.default.createElement(components_1.Section, { style: styles.content },
                    react_1.default.createElement(components_1.Text, { style: styles.title },
                        "You're invited to join ",
                        orgName),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        react_1.default.createElement("strong", null, inviterName),
                        " has invited you to join ",
                        react_1.default.createElement("strong", null, orgName),
                        " as ",
                        react_1.default.createElement("strong", null, displayRole),
                        "."),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        react_1.default.createElement("strong", null,
                            "About ",
                            orgName)),
                    react_1.default.createElement(components_1.Text, { style: styles.body }, truncatedDescription),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        react_1.default.createElement("strong", null, "Your role")),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        "As ",
                        displayRole,
                        ", you will have access to the organization's events, members, and resources based on your permissions."),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        react_1.default.createElement("strong", null, "Create an account to join")),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        "You don't have a Meridian account yet. Create a free account using the same email address this invite was sent to, and you'll automatically be added to ",
                        orgName,
                        "."),
                    react_1.default.createElement(components_1.Button, { href: signUpUrl, style: styles.button }, "Create account & join"),
                    react_1.default.createElement(components_1.Text, { style: styles.footer }, "Use the same email address when signing up. This invitation will expire in 7 days. This is an automated message from Meridian."))))));
};
exports.default = OrgInviteNewUser;
