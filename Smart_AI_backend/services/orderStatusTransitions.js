const STATUS_LIST = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];

const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipping', 'cancelled'],
  shipping: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};

function getAllowedNextStatuses(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] || [];
}

function canTransition(currentStatus, nextStatus) {
  const allowed = getAllowedNextStatuses(currentStatus);
  return allowed.includes(nextStatus);
}

function isTerminal(status) {
  return status === 'delivered' || status === 'cancelled';
}

module.exports = {
  STATUS_LIST,
  VALID_TRANSITIONS,
  getAllowedNextStatuses,
  canTransition,
  isTerminal,
};
