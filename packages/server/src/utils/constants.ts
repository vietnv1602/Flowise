import Auth0SSO from '../enterprise/sso/Auth0SSO'
import AzureSSO from '../enterprise/sso/AzureSSO'
import GithubSSO from '../enterprise/sso/GithubSSO'
import GoogleSSO from '../enterprise/sso/GoogleSSO'

export const WHITELIST_URLS = [
    '/api/v1/verify/apikey/',
    '/api/v1/chatflows/apikey/',
    '/api/v1/public-chatflows',
    '/api/v1/public-chatbotConfig',
    '/api/v1/public-executions',
    '/api/v1/prediction/',
    '/api/v1/vector/upsert/',
    '/api/v1/node-icon/',
    '/api/v1/components-credentials-icon/',
    '/api/v1/chatflows-streaming',
    '/api/v1/chatflows-uploads',
    '/api/v1/openai-assistants-file/download',
    '/api/v1/feedback',
    '/api/v1/leads',
    '/api/v1/chatmessage',
    '/api/v1/get-upload-file',
    '/api/v1/ip',
    '/api/v1/ping',
    '/api/v1/version',
    '/api/v1/attachments',
    '/api/v1/metrics',
    '/api/v1/nvidia-nim',
    '/api/v1/auth/resolve',
    '/api/v1/auth/login',
    '/api/v1/auth/refreshToken',
    '/api/v1/settings',
    '/api/v1/account/logout',
    '/api/v1/account/verify',
    '/api/v1/account/register',
    '/api/v1/account/resend-verification',
    '/api/v1/account/forgot-password',
    '/api/v1/account/reset-password',
    '/api/v1/account/basic-auth',
    '/api/v1/loginmethod',
    '/api/v1/pricing',
    '/api/v1/user/test',
    '/api/v1/oauth2-credential/callback',
    '/api/v1/oauth2-credential/refresh',
    '/api/v1/text-to-speech/generate',
    '/api/v1/text-to-speech/abort',
    '/api/v1/external-sso',
    '/api/v1/chat-builder/',
    AzureSSO.LOGIN_URI,
    AzureSSO.LOGOUT_URI,
    AzureSSO.CALLBACK_URI,
    GoogleSSO.LOGIN_URI,
    GoogleSSO.LOGOUT_URI,
    GoogleSSO.CALLBACK_URI,
    Auth0SSO.LOGIN_URI,
    Auth0SSO.LOGOUT_URI,
    Auth0SSO.CALLBACK_URI,
    GithubSSO.LOGIN_URI,
    GithubSSO.LOGOUT_URI,
    GithubSSO.CALLBACK_URI
]

export const enum GeneralErrorMessage {
    UNAUTHORIZED = 'Unauthorized',
    UNHANDLED_EDGE_CASE = 'Unhandled Edge Case',
    INVALID_PASSWORD = 'Invalid Password',
    NOT_ALLOWED_TO_DELETE_OWNER = 'Not Allowed To Delete Owner',
    INTERNAL_SERVER_ERROR = 'Internal Server Error'
}

export const enum GeneralSuccessMessage {
    CREATED = 'Resource Created Successful',
    UPDATED = 'Resource Updated Successful',
    DELETED = 'Resource Deleted Successful',
    FETCHED = 'Resource Fetched Successful',
    LOGGED_IN = 'Login Successful',
    LOGGED_OUT = 'Logout Successful'
}

export const DOCUMENT_STORE_BASE_FOLDER = 'docustore'

export const OMIT_QUEUE_JOB_DATA = [
    'componentNodes',
    'appDataSource',
    'sseStreamer',
    'telemetry',
    'cachePool',
    'usageCacheManager',
    'abortControllerPool'
]

export const INPUT_PARAMS_TYPE = [
    'asyncOptions',
    'asyncMultiOptions',
    'options',
    'multiOptions',
    'array',
    'datagrid',
    'string',
    'number',
    'boolean',
    'password',
    'json',
    'code',
    'date',
    'file',
    'folder',
    'tabs'
]

export const LICENSE_QUOTAS = {
    // Renew per month
    PREDICTIONS_LIMIT: 'quota:predictions',
    // Static
    FLOWS_LIMIT: 'quota:flows',
    USERS_LIMIT: 'quota:users',
    STORAGE_LIMIT: 'quota:storage',
    ADDITIONAL_SEATS_LIMIT: 'quota:additionalSeats'
} as const

/**
 * Default permissions for external SSO users
 * Used in both external-sso route and externalAuth middleware to ensure consistency
 */
export const EXTERNAL_SSO_DEFAULT_PERMISSIONS = [
    'chatflows:view',
    'chatflows:create',
    'chatflows:update',
    'chatflows:delete',
    'agentflows:view',
    'agentflows:create',
    'agentflows:update',
    'agentflows:delete',
    'credentials:view',
    'credentials:create',
    'credentials:update',
    'credentials:delete',
    'tools:view',
    'tools:create',
    'tools:update',
    'tools:delete',
    'assistants:view',
    'assistants:create',
    'assistants:update',
    'assistants:delete',
    'variables:view',
    'variables:create',
    'variables:update',
    'variables:delete',
    'documentStores:view',
    'documentStores:create',
    'documentStores:update',
    'documentStores:delete',
    'documentStores:add-loader',
    'executions:view',
    'executions:delete',
    'apikeys:view',
    'templates:marketplace',
    'templates:custom'
]

/**
 * Schedule Worker Configuration
 */
export const SCHEDULE_WORKER_CONFIG = {
    CONCURRENCY: 5,
    LOCK_DURATION: 600000, // 10 minutes
    STALLED_INTERVAL: 60000, // 1 minute
    METRICS_INTERVAL: 3000000 // 50 minutes
}
