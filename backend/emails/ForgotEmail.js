"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importDefault(require("react"));
var components_1 = require("@react-email/components");
// Design tokens - matches org invite & Meridian brand
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
        fontSize: "1.5em",
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
    codeBox: {
        fontSize: 24,
        fontWeight: 600,
        textAlign: "center",
        padding: "12px 24px",
        margin: "20px 0",
        backgroundColor: "#F0F4FE",
        border: "1px solid #6D8EFA",
        borderRadius: 8,
        letterSpacing: "2px",
        color: "#6D8EFA",
    },
    footer: {
        marginTop: 24,
        fontSize: 14,
        color: "#6b7280",
        lineHeight: "20px",
    },
};
var MyEmail = function (_a) {
    var name = _a.name, code = _a.code;
    return (react_1.default.createElement(components_1.Html, { style: { margin: 0, width: "100%" } },
        react_1.default.createElement(components_1.Section, { style: styles.container, className: "email-container" },
            react_1.default.createElement(components_1.Section, { style: styles.card, className: "email-content" },
                react_1.default.createElement(components_1.Section, { style: styles.content },
                    react_1.default.createElement(components_1.Text, { style: styles.title }, "Forgot Your Password?"),
                    react_1.default.createElement(components_1.Text, { style: styles.body },
                        "Hi, ",
                        name,
                        "!"),
                    react_1.default.createElement(components_1.Text, { style: styles.body }, "It looks like you requested a password reset for your Meridian account. No worries, we're here to help you get back on track!"),
                    react_1.default.createElement(components_1.Text, { style: styles.body }, "Please use the following verification code to reset your password:"),
                    react_1.default.createElement(components_1.Text, { style: styles.codeBox }, code),
                    react_1.default.createElement(components_1.Text, { style: styles.footer }, "For security reasons, this code will expire in 30 minutes. If you didn't request this password reset, you can safely ignore this email."))))));
};
exports.default = MyEmail;
