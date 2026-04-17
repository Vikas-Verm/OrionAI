"use strict";

function mapGoogleFilePermissions(file = {}) {
  const capabilities = file?.capabilities || {};
  const canEdit = Boolean(capabilities.canEdit || capabilities.canModifyContent);

  return {
    canEdit,
    canRename: Boolean(capabilities.canRename || canEdit),
    canShare: Boolean(capabilities.canShare),
    canDelete: Boolean(capabilities.canTrash || capabilities.canDelete),
    canDownload: capabilities.canDownload !== false,
    canComment: Boolean(capabilities.canComment),
    canCopy: capabilities.canCopy !== false,
    viewOnly: !canEdit,
  };
}

function assertPermission(
  permissions = {},
  capability = "",
  message = "Permission denied."
) {
  if (permissions?.[capability]) return;
  const error = new Error(message);
  error.statusCode = 403;
  throw error;
}

module.exports = {
  assertPermission,
  mapGoogleFilePermissions,
};
