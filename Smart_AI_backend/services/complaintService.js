/**
 * Complaint persistence service — the single place that creates/updates
 * Complaint records for the chat flow.
 *
 * Persistence is UKNOWN to the LLM: it is driven only by the chatController
 * AFTER the user explicitly confirms. Required fields and schema validation
 * are enforced by the Complaint model (sessionId UUID, conversationId,
 * status/priority enums, maxlengths).
 */

const Complaint = require('../models/Complaint');
const logger = require('../utils/logger');

function hasContact(customerContact) {
  return Boolean(customerContact && (customerContact.email || customerContact.phone));
}

/**
 * Append new complaint detail to an existing description while preserving the
 * original report. Hard-capped at the Complaint model's detailedDescription
 * maxlength (2000): the original text is kept first and only the appended part
 * is trimmed when the combined text would overflow.
 */
function mergeComplaintDescription(prior, addition, max = 2000) {
  const existing = String(prior || '').trim();
  const incoming = String(addition || '').trim();
  if (!incoming) return existing;
  if (!existing) return incoming.slice(0, max);

  const joined = `${existing}\n${incoming}`;
  if (joined.length <= max) return joined;

  // Reserve one character for the separating newline so the result stays ≤ max.
  const capacityLeft = Math.max(0, max - existing.length - 1);
  const kept = capacityLeft > 0 ? incoming.slice(0, capacityLeft).trimEnd() : '';
  return kept ? `${existing}\n${kept}` : existing;
}

/**
 * Create a complaint record for a chat conversation.
 *
 * @param {object} params
 *   sessionId         — client conversation session (UUID, model-validated)
 *   conversationId    — mongoose Conversation _id (model-validated, required)
 *   complaintSummary  — short summary (optional, max 500)
 *   detailedDescription — the user's complaint narrative (optional, max 2000)
 *   customerContact   — { email?, phone? } (optional)
 *   priority          — low|medium|high|urgent
 *   tags              — string array
 *
 * Status: 'in_progress' when contact info is present, else 'open'. A complaint
 * that cannot reach the user yet stays 'open' (an actionable complaint with a
 * contact is 'in_progress') — preserving the spirit of the old
 * isComplete-with-contact rule without requiring a live LLM.
 *
 * Throws on model validation failure so the caller surfaces a controlled error.
 */
async function createComplaint({ sessionId, conversationId, complaintSummary, detailedDescription, customerContact, priority = 'medium', tags = [] }) {
  const contact = customerContact || {};
  const complaint = new Complaint({
    sessionId,
    conversationId,
    complaintSummary: complaintSummary || `Khiếu nại từ session ${sessionId}`,
    detailedDescription,
    customerContact: contact,
    status: hasContact(contact) ? 'in_progress' : 'open',
    priority,
    tags: Array.isArray(tags) ? tags : [],
  });

  const saved = await complaint.save();
  logger.info({ complaintId: saved._id, sessionId }, 'Complaint record created');
  return saved;
}

/**
 * Merge chat-extracted data into an existing (already user-confirmed)
 * complaint. Fields are only overwritten when the incoming value is present.
 * Tags are unioned; the status is advanced to 'in_progress' once contact info
 * becomes available (never downgraded back to 'open').
 */
async function updateExistingComplaint(existing, complaintData = {}) {
  if (complaintData.detailedDescription) {
    existing.detailedDescription = complaintData.detailedDescription;
  }

  const contact = complaintData.customerContact || {};
  if (contact.email) {
    existing.customerContact.email = contact.email;
  }
  if (contact.phone) {
    existing.customerContact.phone = contact.phone;
  }

  if (complaintData.priority) {
    existing.priority = complaintData.priority;
  }

  if (Array.isArray(complaintData.tags) && complaintData.tags.length > 0) {
    existing.tags = [...new Set([...(existing.tags || []), ...complaintData.tags])];
  }

  if (hasContact(existing.customerContact) && existing.status === 'open') {
    existing.status = 'in_progress';
  }

  const saved = await existing.save();
  logger.info({ complaintId: saved._id }, 'Complaint record updated');
  return saved;
}

module.exports = {
  createComplaint,
  updateExistingComplaint,
  hasContact,
  mergeComplaintDescription,
};