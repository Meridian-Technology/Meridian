"use strict";
var __assign = (this && this.__assign) || function (t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = __importDefault(require("react"));
var components_1 = require("@react-email/components");
var OrgInviteExistingUser = function (_a) {
    var orgName = _a.orgName, role = _a.role, inviterName = _a.inviterName, acceptUrl = _a.acceptUrl, declineUrl = _a.declineUrl;
    var textStyles = {
        fontSize: 16,
        lineHeight: "24px",
        color: "#414141",
        textAlign: "left",
    };
    return (react_1.default.createElement(components_1.Html, { style: { margin: 0, width: "100%" } },
        react_1.default.createElement(components_1.Section, { style: {
                margin: 0,
                padding: "30px 0px",
                width: "100%",
                height: "100%",
                backgroundColor: "#F0F2F3",
            }, className: "email-container" },
            react_1.default.createElement(components_1.Section, { style: {
                    textAlign: "center",
                    margin: "auto",
                    maxWidth: "600px",
                    backgroundColor: "#FFFFFF",
                    borderRadius: 10,
                    overflow: "hidden",
                }, className: "email-content" },
                react_1.default.createElement(components_1.Row, null,
                    react_1.default.createElement(components_1.Img, { src: "https://studycompass.s3.us-east-1.amazonaws.com/email/Header.png", style: { width: "100%", objectFit: "cover" } })),
                react_1.default.createElement(components_1.Section, { style: { padding: "0 20px 20px 20px" } },
                    react_1.default.createElement(components_1.Text, { style: {
                            margin: "0px",
                            fontSize: 20,
                            lineHeight: "28px",
                            fontWeight: 600,
                            color: "#414141",
                        } }, "Organization Invitation"),
                    react_1.default.createElement(components_1.Container, { style: { padding: "0 10%", boxSizing: "border-box" } },
                        react_1.default.createElement(components_1.Text, { style: textStyles },
                            "You have been invited to join ",
                            react_1.default.createElement("strong", null, orgName),
                            " as ",
                            react_1.default.createElement("em", null, role),
                            "."),
                        inviterName && react_1.default.createElement(components_1.Text, { style: textStyles },
                            inviterName,
                            " invited you to join this organization."),
                        react_1.default.createElement(components_1.Text, { style: textStyles }, "Click below to accept or decline this invitation."),
                        react_1.default.createElement(components_1.Row, { style: { marginTop: 24 } },
                            react_1.default.createElement(components_1.Button, { href: acceptUrl, style: {
                                    backgroundColor: "#22c55e",
                                    color: "#fff",
                                    padding: "12px 24px",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                    marginRight: 12,
                                } }, "Accept"),
                            react_1.default.createElement(components_1.Button, { href: declineUrl, style: {
                                    backgroundColor: "#6b7280",
                                    color: "#fff",
                                    padding: "12px 24px",
                                    borderRadius: 8,
                                    fontWeight: 600,
                                } }, "Decline")),
                        react_1.default.createElement(components_1.Text, { style: __assign(__assign({}, textStyles), { marginTop: 24, fontSize: 14, color: "#6b7280" }) }, "This invitation will expire in 7 days.")))))));
};
exports.default = OrgInviteExistingUser;
