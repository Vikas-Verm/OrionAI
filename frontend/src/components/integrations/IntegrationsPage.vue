<template>
    <div class="integrations-page">
        <form class="int-autofill-trap" autocomplete="on" @submit.prevent>
            <input type="text" name="username" autocomplete="username" tabindex="-1" />
            <input type="password" name="password" autocomplete="current-password" tabindex="-1" />
        </form>

        <!-- Header -->
        <div class="int-header">
            <div class="int-header-left">
                <button class="int-back-btn" @click="emit('close')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 12H5M12 5l-7 7 7 7" />
                    </svg>
                </button>
                <div>
                    <h1 class="int-title">Integrations</h1>
                    <p class="int-subtitle">Connect OrionAI to your business tools</p>
                </div>
            </div>
            <div class="int-header-badges">
                <div v-if="errorCount > 0" class="int-header-badge int-header-badge--error">
                    <span class="badge-dot-warn"></span>
                    {{ errorCount }} need{{ errorCount === 1 ? 's' : '' }} attention
                </div>
                <div class="int-header-badge">
                    <span class="badge-dot"></span>
                    {{ connectedCount }} connected
                </div>
            </div>
        </div>

        <!-- Search -->
        <div class="int-search-wrap">
            <svg class="int-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
            </svg>
            <input
                v-model="search"
                class="int-search"
                type="search"
                name="orion_integration_search"
                placeholder="Search integrations..."
                autocomplete="off"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                data-lpignore="true"
                data-form-type="other"
            />
        </div>

        <!-- Grid -->
        <div class="int-grid">
            <div v-for="card in filteredCards" :key="card.type"
                :id="'int-card-' + card.type"
                :class="['int-card', getStatus(card.type), expandedType === card.type ? 'expanded' : '', getHealthStatus(card.type) === 'error' ? 'health-error' : '']"
                @click="toggleExpand(card.type)">

                <!-- Card top -->
                <div class="int-card-top">
                    <div class="int-card-icon" :class="`int-card-icon--${card.type}`" :style="{ background: card.color }">
                        <img v-if="card.img" :src="card.img" :alt="card.name" class="int-logo" />
                        <svg v-else-if="card.type === 'razorpay'" class="int-brand-icon int-brand-icon--razorpay" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M13.87 3H8.615a.75.75 0 0 0-.75.75v.002c0 .065.008.13.026.193l1.217 4.75H6.01a.75.75 0 0 0-.65 1.125l2.596 4.5-.702 5.436a.75.75 0 0 0 1.176.696l8.458-6.075a.75.75 0 0 0-.227-1.334l-4.03-.97 2.194-2.46a.75.75 0 0 0-.502-1.246h-2.42l2.26-4.248A.75.75 0 0 0 13.87 3Z"/>
                        </svg>
                        <span v-else class="int-emoji">{{ card.emoji }}</span>
                    </div>
                    <div class="int-card-info">
                        <div class="int-card-name">{{ card.name }}</div>
                        <div class="int-card-desc">{{ card.desc }}</div>
                    </div>
                    <div class="int-card-right">
                        <span v-if="card.comingSoon" class="badge-soon">Soon</span>
                        <span v-else-if="getStatus(card.type) === 'connected'" class="badge-connected">
                            <span class="badge-dot green"></span> Connected
                        </span>
                        <span v-else-if="getStatus(card.type) === 'pending'" class="badge-pending">Connecting</span>
                        <span v-else-if="getStatus(card.type) === 'error'" class="badge-error">Needs attention</span>
                        <span v-else class="badge-disconnected">Not connected</span>
                        <svg v-if="!card.comingSoon" class="int-chevron"
                            :class="{ rotated: expandedType === card.type }" width="14" height="14" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>

                <!-- Expanded form -->
                <transition name="int-expand">
                    <div v-if="expandedType === card.type && !card.comingSoon" class="int-card-form" @click.stop>

                        <!-- SLACK — OAuth (reads/sends as the real user) -->
                        <template v-if="card.type === 'slack'">
                            <div v-if="getStatus('slack') === 'connected'" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Signed in as</div>
                                        <div class="int-oauth-connected-email">
                                            {{ connected.slack?.slack?.realName || connected.slack?.slack?.userName || 'Connected' }}
                                            <span v-if="connected.slack?.slack?.teamName" style="color:var(--text-muted);font-weight:400">
                                                · {{ connected.slack.slack.teamName }}
                                            </span>
                                        </div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn" @click.stop="startSlackOAuth">Reconnect</button>
                                </div>
                                <div class="int-actions" style="margin-top:10px">
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'slack'"
                                        @click.stop="removeIntegration('slack')">
                                        <span v-if="removing === 'slack'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Disconnect</span>
                                    </button>
                                    <button class="int-btn int-btn-test" style="margin-left:0"
                                        @click.stop="emit('openModule', 'slack')">
                                        Open Slack ↗
                                    </button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <!-- Slack logo -->
                                <svg width="36" height="36" viewBox="0 0 24 24" style="flex-shrink:0">
                                    <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"/>
                                    <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.527 2.527 0 012.521 2.521 2.527 2.527 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z"/>
                                    <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.527 2.527 0 01-2.521 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.167 0a2.528 2.528 0 012.521 2.522v6.312z"/>
                                    <path fill="#ECB22E" d="M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zM15.167 17.688a2.527 2.527 0 01-2.521-2.523 2.527 2.527 0 012.521-2.52h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.311z"/>
                                </svg>
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect your Slack</div>
                                    <div class="int-oauth-desc">Read and send messages as yourself — DMs, channels and groups</div>
                                </div>
                                <button class="int-oauth-btn-slack" @click.stop="startSlackOAuth" :disabled="slackConnecting">
                                    <span v-if="slackConnecting" class="int-oauth-spinner"></span>
                                    <span v-else style="display:flex;align-items:center;gap:8px">
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52z"/>
                                            <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.527 2.527 0 012.521 2.522v2.52H8.834z"/>
                                            <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.527 2.527 0 01-2.522 2.521h-2.522V8.834z"/>
                                            <path fill="#ECB22E" d="M15.167 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.167 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521z"/>
                                        </svg>
                                        Sign in with Slack
                                    </span>
                                </button>
                            </div>
                        </template>

                        <!-- NOTION -->
                        <!-- <template v-else-if="card.type === 'notion'">
                            <div class="int-field-group">
                                <label class="int-label">
                                    Internal Integration Token
                                    <a href="https://www.notion.so/my-integrations" target="_blank"
                                        class="int-help-link">Get token ↗</a>
                                </label>
                                <div class="int-secret-wrap">
                                    <input v-model="forms.notion.apiToken" class="int-input int-input--secret" placeholder="secret_..."
                                        :type="secretInputType('notion', 'apiToken')" />
                                    <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('notion', 'apiToken')"
                                        @click.stop="toggleSecretVisibility('notion', 'apiToken')">
                                        <svg v-if="isSecretVisible('notion', 'apiToken')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                            <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                            <path d="M1 1l22 22" />
                                            <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                        </svg>
                                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="int-field-group">
                                <label class="int-label">Database ID <span
                                        class="int-label-opt">(optional)</span></label>
                                <input v-model="forms.notion.databaseId" class="int-input"
                                    placeholder="32-character database ID" />
                            </div>
                            <div class="int-setup-steps">
                                <div class="int-steps-title">Setup:</div>
                                <ol class="int-steps-list">
                                    <li>Go to <a href="https://www.notion.so/my-integrations" target="_blank"
                                            class="int-help-link">notion.so/my-integrations</a> → New integration</li>
                                    <li>Name it "OrionAI" → submit → copy the Internal Integration Token</li>
                                    <li>In Notion, open your database → Share → Invite your integration</li>
                                    <li>Copy the database ID from the URL (32 chars after the last /)</li>
                                </ol>
                            </div>
                        </template> -->

                        <!-- JIRA -->
                        <template v-else-if="card.type === 'jira'">
                            <div class="int-field-group">
                                <label class="int-label">Atlassian Domain</label>
                                <input v-model="forms.jira.domain" class="int-input"
                                    placeholder="yourcompany.atlassian.net" />
                            </div>
                            <div class="int-field-row">
                                <div class="int-field-group">
                                    <label class="int-label">Email</label>
                                    <input v-model="forms.jira.email" class="int-input" placeholder="you@company.com"
                                        type="email" />
                                </div>
                                <div class="int-field-group">
                                    <label class="int-label">
                                        API Token
                                        <a href="https://id.atlassian.com/manage-profile/security/api-tokens"
                                            target="_blank" class="int-help-link">Get token ↗</a>
                                    </label>
                                    <div class="int-secret-wrap">
                                        <input v-model="forms.jira.apiToken" class="int-input int-input--secret" placeholder="API token"
                                            :type="secretInputType('jira', 'apiToken')" />
                                        <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('jira', 'apiToken')"
                                            @click.stop="toggleSecretVisibility('jira', 'apiToken')">
                                            <svg v-if="isSecretVisible('jira', 'apiToken')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                                <path d="M1 1l22 22" />
                                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                            </svg>
                                            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="int-field-group">
                                <label class="int-label">Default Project Key</label>
                                <input v-model="forms.jira.projectKey" class="int-input" placeholder="POSHN" />
                            </div>
                        </template>

                        <!-- WEBHOOK -->
                        <template v-else-if="card.type === 'webhook'">
                            <div class="int-field-group">
                                <label class="int-label">Endpoint URL</label>
                                <input v-model="forms.webhook.url" class="int-input"
                                    placeholder="https://your-app.com/webhook" type="url" />
                            </div>
                            <div class="int-field-row">
                                <div class="int-field-group">
                                    <label class="int-label">Method</label>
                                    <select v-model="forms.webhook.method" class="int-input">
                                        <option>POST</option>
                                        <option>PUT</option>
                                        <option>PATCH</option>
                                    </select>
                                </div>
                                <div class="int-field-group">
                                    <label class="int-label">Secret <span
                                            class="int-label-opt">(optional)</span></label>
                                    <div class="int-secret-wrap">
                                        <input v-model="forms.webhook.secret" class="int-input int-input--secret" placeholder="Signing secret"
                                            :type="secretInputType('webhook', 'secret')" />
                                        <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('webhook', 'secret')"
                                            @click.stop="toggleSecretVisibility('webhook', 'secret')">
                                            <svg v-if="isSecretVisible('webhook', 'secret')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                                <path d="M1 1l22 22" />
                                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                            </svg>
                                            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </template>

                        <!-- DATABASE -->
                        <template v-else-if="card.type === 'database'">
                            <div class="int-field-group">
                                <label class="int-label">Database Type</label>
                                <select v-model="forms.database.vendor" class="int-input">
                                    <option value="postgres">PostgreSQL</option>
                                    <option value="mysql">MySQL</option>
                                    <option value="mongodb">MongoDB</option>
                                    <option value="sqlite">SQLite</option>
                                </select>
                            </div>

                            <div v-if="forms.database.vendor !== 'sqlite'" class="int-field-group">
                                <label class="int-label">Connection String</label>
                                <div class="int-secret-wrap">
                                    <input
                                        v-model="forms.database.connectionString"
                                        class="int-input int-input--secret"
                                        :placeholder="forms.database.vendor === 'mongodb'
                                          ? 'mongodb+srv://user:pass@cluster/db'
                                          : forms.database.vendor === 'mysql'
                                            ? 'mysql://user:pass@host:3306/db'
                                            : 'postgresql://user:pass@host:5432/db'"
                                        :type="secretInputType('database', 'connectionString')"
                                    />
                                    <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('database', 'connectionString')"
                                        @click.stop="toggleSecretVisibility('database', 'connectionString')">
                                        <svg v-if="isSecretVisible('database', 'connectionString')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                            <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                            <path d="M1 1l22 22" />
                                            <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                        </svg>
                                        <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div v-else class="int-field-group">
                                <label class="int-label">SQLite File Path</label>
                                <input
                                    v-model="forms.database.filePath"
                                    class="int-input"
                                    placeholder="/absolute/path/to/database.sqlite"
                                />
                            </div>

                            <div class="int-field-row" v-if="forms.database.vendor !== 'sqlite'">
                                <div class="int-field-group">
                                    <label class="int-label">Default Schema <span class="int-label-opt">(optional)</span></label>
                                    <input v-model="forms.database.defaultSchema" class="int-input" placeholder="public" />
                                </div>
                                <div class="int-field-group">
                                    <label class="int-label">SSL</label>
                                    <select v-model="forms.database.ssl" class="int-input">
                                        <option :value="false">Disabled</option>
                                        <option :value="true">Enabled</option>
                                    </select>
                                </div>
                            </div>

                            <div class="int-setup-steps">
                                <div class="int-steps-title">How OrionAI uses it:</div>
                                <ol class="int-steps-list">
                                    <li>Queries stay read-only for safer business exploration.</li>
                                    <li>The same connection powers both Data mode and Agent mode.</li>
                                    <li>Use a reporting replica or read-only user in production.</li>
                                </ol>
                            </div>
                        </template>

                        <!-- RAZORPAY -->
                        <!-- <template v-else-if="card.type === 'razorpay'">
                            <div class="int-field-row">
                                <div class="int-field-group">
                                    <label class="int-label">Key ID</label>
                                    <input v-model="forms.razorpay.keyId" class="int-input" placeholder="rzp_live_..." />
                                </div>
                                <div class="int-field-group">
                                    <label class="int-label">
                                        Key Secret
                                        <a href="https://razorpay.com/docs/" target="_blank" class="int-help-link">Docs ↗</a>
                                    </label>
                                    <div class="int-secret-wrap">
                                        <input v-model="forms.razorpay.keySecret" class="int-input int-input--secret" placeholder="Razorpay secret" :type="secretInputType('razorpay', 'keySecret')" />
                                        <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('razorpay', 'keySecret')"
                                            @click.stop="toggleSecretVisibility('razorpay', 'keySecret')">
                                            <svg v-if="isSecretVisible('razorpay', 'keySecret')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                                <path d="M1 1l22 22" />
                                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                            </svg>
                                            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="int-field-row">
                                <div class="int-field-group">
                                    <label class="int-label">Default Source Account Number</label>
                                    <input v-model="forms.razorpay.accountNumber" class="int-input" placeholder="2323230089" />
                                </div>
                                <div class="int-field-group">
                                    <label class="int-label">Webhook Secret <span class="int-label-opt">(optional)</span></label>
                                    <div class="int-secret-wrap">
                                        <input v-model="forms.razorpay.webhookSecret" class="int-input int-input--secret" placeholder="Webhook secret" :type="secretInputType('razorpay', 'webhookSecret')" />
                                        <button class="int-secret-toggle" type="button" :aria-label="secretToggleLabel('razorpay', 'webhookSecret')"
                                            @click.stop="toggleSecretVisibility('razorpay', 'webhookSecret')">
                                            <svg v-if="isSecretVisible('razorpay', 'webhookSecret')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.89 1 12c.73-2.06 1.94-3.87 3.46-5.29" />
                                                <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                                                <path d="M1 1l22 22" />
                                                <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9.27 3.11 11 8a11.08 11.08 0 0 1-4.17 5.94" />
                                            </svg>
                                            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="int-setup-steps">
                                <div class="int-steps-title">Use cases:</div>
                                <ol class="int-steps-list">
                                    <li>Ask OrionAI for recent payouts and status checks.</li>
                                    <li>Create Razorpay payouts in Agent mode with confirmation before money moves.</li>
                                    <li>Keep the connected key scoped to the business account you want OrionAI to operate on.</li>
                                </ol>
                            </div>
                        </template> -->

                        <!-- GMAIL -->
                        <template v-else-if="card.type === 'gmail'">
                            <div v-if="oauthEmails.gmail" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Connected as</div>
                                        <div class="int-oauth-connected-email">{{ oauthEmails.gmail }}</div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn"
                                        @click.stop="startGmailOAuth">Reconnect</button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <img src="https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png"
                                    class="int-oauth-icon-img" alt="Gmail" />
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect your Gmail</div>
                                    <div class="int-oauth-desc">Read, send and reply to emails directly from OrionAI
                                    </div>
                                </div>
                                <button class="int-oauth-btn-google" @click.stop="startGmailOAuth"
                                    :disabled="gmailConnecting">
                                    <span v-if="gmailConnecting" class="int-oauth-spinner"></span>
                                    <span v-else style="display:flex;align-items:center;gap:8px">
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Sign in with Google
                                    </span>
                                </button>
                            </div>
                            <div v-if="getStatus('gmail') === 'connected'" class="int-actions" style="margin-top:8px">
                                <button class="int-btn int-btn-remove" :disabled="removing === 'gmail'"
                                    @click.stop="removeIntegration('gmail')">
                                    <span v-if="removing === 'gmail'" class="int-spinner int-spinner-danger"></span>
                                    <span v-else>Disconnect</span>
                                </button>
                            </div>
                        </template>

                        <!-- GOOGLE DOCS -->
                        <template v-else-if="card.type === 'google_docs'">
                            <div v-if="oauthEmails.google_docs" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Connected as</div>
                                        <div class="int-oauth-connected-email">{{ oauthEmails.google_docs }}</div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn"
                                        @click.stop="startGoogleDocsOAuth">Reconnect</button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <img src="https://ssl.gstatic.com/docs/doclist/images/mediatype/icon_1_document_x16.png"
                                    class="int-oauth-icon-img" alt="Google Docs" />
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect Google Docs</div>
                                    <div class="int-oauth-desc">Open, write, and improve documents from OrionAI without leaving the workspace.</div>
                                </div>
                                <button class="int-oauth-btn-google" @click.stop="startGoogleDocsOAuth"
                                    :disabled="googleDocsConnecting">
                                    <span v-if="googleDocsConnecting" class="int-oauth-spinner"></span>
                                    <span v-else style="display:flex;align-items:center;gap:8px">
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Sign in with Google
                                    </span>
                                </button>
                            </div>
                            <div v-if="getStatus('google_docs') === 'connected'" class="int-actions" style="margin-top:8px">
                                <button class="int-btn int-btn-test" @click.stop="emit('openModule', 'google_docs')">
                                    Open Google Docs ↗
                                </button>
                                <button class="int-btn int-btn-remove" :disabled="removing === 'google_docs'"
                                    @click.stop="removeIntegration('google_docs')">
                                    <span v-if="removing === 'google_docs'" class="int-spinner int-spinner-danger"></span>
                                    <span v-else>Disconnect</span>
                                </button>
                            </div>
                        </template>

                        <!-- GOOGLE SHEETS -->
                        <template v-else-if="card.type === 'google_sheets'">
                            <div v-if="oauthEmails.google_sheets" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Connected as</div>
                                        <div class="int-oauth-connected-email">{{ oauthEmails.google_sheets }}</div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn"
                                        @click.stop="startGoogleSheetsOAuth">Reconnect</button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <img src="/google-sheets-logo.svg"
                                    class="int-oauth-icon-img" alt="Google Sheets" />
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect Google Sheets</div>
                                    <div class="int-oauth-desc">Open, edit, format, chart and analyze spreadsheets from OrionAI in a native sheet workspace.</div>
                                </div>
                                <button class="int-oauth-btn-google" @click.stop="startGoogleSheetsOAuth"
                                    :disabled="googleSheetsConnecting">
                                    <span v-if="googleSheetsConnecting" class="int-oauth-spinner"></span>
                                    <span v-else style="display:flex;align-items:center;gap:8px">
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Sign in with Google
                                    </span>
                                </button>
                            </div>
                            <div v-if="getStatus('google_sheets') === 'connected'" class="int-actions" style="margin-top:8px">
                                <button class="int-btn int-btn-test" @click.stop="emit('openModule', 'google_sheets')">
                                    Open Google Sheets ↗
                                </button>
                                <button class="int-btn int-btn-remove" :disabled="removing === 'google_sheets'"
                                    @click.stop="removeIntegration('google_sheets')">
                                    <span v-if="removing === 'google_sheets'" class="int-spinner int-spinner-danger"></span>
                                    <span v-else>Disconnect</span>
                                </button>
                            </div>
                        </template>

                        <!-- GOOGLE CALENDAR -->
                        <template v-else-if="card.type === 'google_calendar'">
                            <div v-if="oauthEmails.google_calendar" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Connected as</div>
                                        <div class="int-oauth-connected-email">{{ oauthEmails.google_calendar }}</div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn"
                                        @click.stop="startCalendarOAuth">Reconnect</button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <img src="https://ssl.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_17_2x.png"
                                    class="int-oauth-icon-img" alt="Google Calendar" />
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect Google Calendar</div>
                                    <div class="int-oauth-desc">View, create and manage events from OrionAI</div>
                                </div>
                                <button class="int-oauth-btn-google" @click.stop="startCalendarOAuth"
                                    :disabled="calendarConnecting">
                                    <span v-if="calendarConnecting" class="int-oauth-spinner"></span>
                                    <span v-else style="display:flex;align-items:center;gap:8px">
                                        <svg width="16" height="16" viewBox="0 0 24 24">
                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                        </svg>
                                        Sign in with Google
                                    </span>
                                </button>
                            </div>
                            <div v-if="getStatus('google_calendar') === 'connected'" class="int-actions"
                                style="margin-top:8px">
                                <button class="int-btn int-btn-remove" :disabled="removing === 'google_calendar'"
                                    @click.stop="removeIntegration('google_calendar')">
                                    <span v-if="removing === 'google_calendar'"
                                        class="int-spinner int-spinner-danger"></span>
                                    <span v-else>Disconnect</span>
                                </button>
                            </div>
                        </template>

                        <!-- TELEGRAM -->
                        <template v-else-if="card.type === 'telegram'">
                            <div class="int-field-group">
                                <div v-if="getStatus('telegram') === 'connected'" class="int-oauth-connected">
                                    <div class="int-oauth-connected-row">
                                        <span class="int-oauth-connected-icon">✅</span>
                                        <div class="int-oauth-connected-info">
                                            <div class="int-oauth-connected-title">Connected</div>
                                            <div class="int-oauth-connected-email">Telegram account linked</div>
                                        </div>
                                        <button class="int-btn int-btn-test" @click.stop="emit('openModule', 'telegram')">
                                            Open ↗
                                        </button>
                                    </div>
                                    <div class="int-actions" style="margin-top:10px">
                                        <button class="int-btn int-btn-remove" :disabled="removing === 'telegram'"
                                            @click.stop="removeIntegration('telegram')">
                                            <span v-if="removing === 'telegram'" class="int-spinner int-spinner-danger"></span>
                                            <span v-else>Disconnect</span>
                                        </button>
                                    </div>
                                </div>
                                <div v-else class="int-oauth-block">
                                    <span style="font-size:36px;flex-shrink:0">✈️</span>
                                    <div class="int-oauth-text">
                                        <div class="int-oauth-title">Connect your Telegram</div>
                                        <div class="int-oauth-desc">Read and send messages via MTProto — same as Telegram Web</div>
                                    </div>
                                    <button class="int-oauth-btn-google" @click.stop="emit('openModule', 'telegram')">
                                        <span style="font-size:15px">✈️</span>
                                        Connect Telegram
                                    </button>
                                </div>
                            </div>
                        </template>
                        <!-- SIGNAL -->
                        <template v-else-if="card.type === 'signal'">
                            <div v-if="signalCardState === 'connected'" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">Signal connected</div>
                                        <div class="int-oauth-connected-email">
                                            {{ signalStatus?.profile?.displayName || 'Linked successfully' }}
                                            <span v-if="signalStatus?.roomCount" style="color:var(--text-muted);font-weight:400">
                                                · {{ signalStatus?.roomCount }} chat{{ signalStatus?.roomCount === 1 ? '' : 's' }}
                                            </span>
                                        </div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn" :disabled="signalConnecting" @click.stop="startSignalConnect({ reconnect: true })">
                                        <span v-if="signalConnecting" class="int-oauth-spinner"></span>
                                        <span v-else>Reconnect</span>
                                    </button>
                                </div>
                                <div class="int-actions" style="margin-top:10px">
                                    <button class="int-btn int-btn-test" @click.stop="emit('openModule', 'signal')">
                                        Open chats ↗
                                    </button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshSignalStatus">
                                        Refresh status
                                    </button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'signal'" @click.stop="removeIntegration('signal')">
                                        <span v-if="removing === 'signal'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Disconnect</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else-if="signalCardState === 'pending'" class="int-signal-panel">
                                <div class="int-signal-panel-head">
                                    <div class="int-oauth-text">
                                        <div class="int-oauth-title">Finish linking Signal</div>
                                        <div class="int-oauth-desc">OrionAI is preparing your secure Signal session. Scan the QR code here to complete setup.</div>
                                    </div>
                                    <span class="badge-pending">Waiting for scan</span>
                                </div>
                                <div class="int-signal-qr-preview">
                                    <img
                                        v-if="signalStatus?.qrImageUrl"
                                        :src="signalStatus.qrImageUrl"
                                        alt="Signal QR code"
                                        class="int-signal-qr-image"
                                    />
                                    <div v-else class="int-signal-qr-placeholder">
                                        <span class="int-spinner"></span>
                                        <span>Preparing QR code...</span>
                                    </div>
                                    <ol class="int-steps-list int-steps-list--compact">
                                        <li>Open Signal on your phone</li>
                                        <li>Go to Linked Devices</li>
                                        <li>Scan this QR code</li>
                                    </ol>
                                </div>
                                <div class="int-actions">
                                    <button class="int-btn int-btn-save" @click.stop="openSignalQrModal">Open QR</button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshSignalStatus">Check status</button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'signal'" @click.stop="removeIntegration('signal')">
                                        <span v-if="removing === 'signal'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Cancel</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else-if="signalCardState === 'error'" class="int-signal-panel int-signal-panel--error">
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Signal needs attention</div>
                                    <div class="int-oauth-desc">
                                        {{ signalStatus?.lastError || signalStatus?.error || 'We could not finish linking Signal. Try again to generate a fresh QR code.' }}
                                    </div>
                                </div>
                                <div class="int-actions">
                                    <button class="int-btn int-btn-save" :disabled="signalConnecting" @click.stop="startSignalConnect({ reconnect: true })">
                                        <span v-if="signalConnecting" class="int-spinner"></span>
                                        <span v-else>Retry</span>
                                    </button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshSignalStatus">Check status</button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'signal'" @click.stop="removeIntegration('signal')">
                                        <span v-if="removing === 'signal'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Disconnect</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <span style="font-size:36px;flex-shrink:0">🛡️</span>
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect Signal securely</div>
                                    <div class="int-oauth-desc">Link Signal in OrionAI, view live chats, upload files, and surface urgent messages in WorkspaceBriefing without any extra setup.</div>
                                </div>
                                <button class="int-oauth-btn-google" :disabled="signalConnecting" @click.stop="startSignalConnect()">
                                    <span v-if="signalConnecting" class="int-oauth-spinner"></span>
                                    <span v-else>Connect Signal</span>
                                </button>
                            </div>
                        </template>
                        <!-- WHATSAPP -->
                        <template v-else-if="card.type === 'whatsapp'">
                            <div v-if="whatsappCardState === 'connected'" class="int-oauth-connected">
                                <div class="int-oauth-connected-row">
                                    <span class="int-oauth-connected-icon">✅</span>
                                    <div class="int-oauth-connected-info">
                                        <div class="int-oauth-connected-title">WhatsApp connected</div>
                                        <div class="int-oauth-connected-email">
                                            {{ whatsappStatus?.profile?.displayName || 'Linked successfully' }}
                                            <span v-if="whatsappStatus?.roomCount" style="color:var(--text-muted);font-weight:400">
                                                · {{ whatsappStatus?.roomCount }} chat{{ whatsappStatus?.roomCount === 1 ? '' : 's' }}
                                            </span>
                                        </div>
                                    </div>
                                    <button class="int-oauth-reconnect-btn" :disabled="whatsappConnecting" @click.stop="startWhatsAppConnect({ reconnect: true })">
                                        <span v-if="whatsappConnecting" class="int-oauth-spinner"></span>
                                        <span v-else>Reconnect</span>
                                    </button>
                                </div>
                                <div class="int-actions" style="margin-top:10px">
                                    <button class="int-btn int-btn-test" @click.stop="emit('openModule', 'whatsapp')">
                                        Open chats ↗
                                    </button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshWhatsAppStatus">
                                        Refresh status
                                    </button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'whatsapp'" @click.stop="removeIntegration('whatsapp')">
                                        <span v-if="removing === 'whatsapp'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Disconnect</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else-if="whatsappCardState === 'pending'" class="int-signal-panel">
                                <div class="int-signal-panel-head">
                                    <div class="int-oauth-text">
                                        <div class="int-oauth-title">Connect WhatsApp</div>
                                        <div class="int-oauth-desc">OrionAI is preparing your hidden WhatsApp session. Scan the QR code here to finish linking your phone.</div>
                                    </div>
                                    <span class="badge-pending">Waiting for scan</span>
                                </div>
                                <div class="int-signal-qr-preview">
                                    <img
  v-if="whatsappQrStableSrc"
  :src="whatsappQrStableSrc"
  alt="WhatsApp QR code"
  class="int-signal-qr-image"
/>
                                    <div v-else class="int-signal-qr-placeholder">
                                        <span class="int-spinner"></span>
                                        <span>Preparing QR code...</span>
                                    </div>
                                    <ol class="int-steps-list int-steps-list--compact">
                                        <li>Open WhatsApp on your phone</li>
                                        <li>Go to Linked Devices</li>
                                        <li>Scan this QR code</li>
                                    </ol>
                                </div>
                                <div class="int-actions">
                                    <button class="int-btn int-btn-save" @click.stop="openWhatsAppQrModal">Open QR</button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshWhatsAppStatus">Check status</button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'whatsapp'" @click.stop="removeIntegration('whatsapp')">
                                        <span v-if="removing === 'whatsapp'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Cancel</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else-if="whatsappCardState === 'error'" class="int-signal-panel int-signal-panel--error">
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">WhatsApp needs attention</div>
                                    <div class="int-oauth-desc">
                                        {{ whatsappStatus?.lastError || whatsappStatus?.error || 'We could not finish linking WhatsApp. Try again to generate a fresh QR code.' }}
                                    </div>
                                </div>
                                <div class="int-actions">
                                    <button class="int-btn int-btn-save" :disabled="whatsappConnecting" @click.stop="startWhatsAppConnect({ reconnect: true })">
                                        <span v-if="whatsappConnecting" class="int-spinner"></span>
                                        <span v-else>Retry</span>
                                    </button>
                                    <button class="int-btn int-btn-test" @click.stop="refreshWhatsAppStatus">Check status</button>
                                    <button class="int-btn int-btn-remove" :disabled="removing === 'whatsapp'" @click.stop="removeIntegration('whatsapp')">
                                        <span v-if="removing === 'whatsapp'" class="int-spinner int-spinner-danger"></span>
                                        <span v-else>Disconnect</span>
                                    </button>
                                </div>
                            </div>
                            <div v-else class="int-oauth-block">
                                <span style="font-size:36px;flex-shrink:0">💬</span>
                                <div class="int-oauth-text">
                                    <div class="int-oauth-title">Connect WhatsApp</div>
                                    <div class="int-oauth-desc">Connect WhatsApp securely in OrionAI, scan the QR here, and open live chats without exposing any Matrix setup.</div>
                                </div>
                                <button class="int-oauth-btn-google" :disabled="whatsappConnecting" @click.stop="startWhatsAppConnect()">
                                    <span v-if="whatsappConnecting" class="int-oauth-spinner"></span>
                                    <span v-else>Connect WhatsApp</span>
                                </button>
                            </div>
                        </template>

                        <!-- Action buttons: only for manual-token integrations -->
                        <div v-if="!['gmail', 'google_docs', 'google_sheets', 'google_calendar', 'telegram', 'signal', 'slack', 'whatsapp'].includes(card.type)" class="int-actions">
                            <button class="int-btn int-btn-test" :disabled="testing === card.type"
                                @click.stop="testConnection(card.type)">
                                <span v-if="testing === card.type" class="int-spinner"></span>
                                <span v-else>⚡ Test</span>
                            </button>
                            <button class="int-btn int-btn-save" :disabled="saving === card.type"
                                @click.stop="saveIntegration(card.type)">
                                <span v-if="saving === card.type" class="int-spinner"></span>
                                <span v-else>Save</span>
                            </button>
                            <button
                                v-if="getStatus(card.type) === 'connected' && ['database', 'razorpay'].includes(card.type)"
                                class="int-btn int-btn-test"
                                @click.stop="emit('openModule', card.type)">
                                Open ↗
                            </button>
                            <button v-if="getStatus(card.type) === 'connected'" class="int-btn int-btn-remove"
                                :disabled="removing === card.type" @click.stop="removeIntegration(card.type)">
                                <span v-if="removing === card.type" class="int-spinner int-spinner-danger"></span>
                                <span v-else>Remove</span>
                            </button>
                        </div>

                        <!-- Test result -->
                        <transition name="fade">
                            <div v-if="testResults[card.type]"
                                :class="['int-test-result', testResults[card.type].ok ? 'ok' : 'fail']">
                                {{ testResults[card.type].ok ? '✅' : '❌' }}
                                {{ testResults[card.type].message || testResults[card.type].error }}
                            </div>
                        </transition>

                    </div>
                </transition>
            </div>
        </div>

        <transition name="fade">
            <div v-if="showSignalQrModal" class="int-modal-backdrop" @click.self="closeSignalQrModal">
                <div class="int-modal">
                    <div class="int-modal-head">
                        <div>
                            <h3>Link Signal</h3>
                            <p>Scan this QR code from Signal to finish linking your OrionAI workspace.</p>
                        </div>
                        <button class="int-modal-close" type="button" @click="closeSignalQrModal">✕</button>
                    </div>

                    <div class="int-modal-body">
                        <div v-if="signalStatus?.qrImageUrl" class="int-signal-qr-modal">
                            <img :src="signalStatus.qrImageUrl" alt="Signal QR code" class="int-signal-qr-image int-signal-qr-image--modal" />
                        </div>
                        <div v-else class="int-signal-qr-placeholder int-signal-qr-placeholder--modal">
                            <span class="int-spinner"></span>
                            <span>Preparing QR code...</span>
                        </div>

                        <ol class="int-steps-list int-steps-list--compact">
                            <li>Open Signal on your phone</li>
                            <li>Open Linked Devices</li>
                            <li>Scan this QR code</li>
                        </ol>

                        <div v-if="signalStatus?.lastError || signalStatus?.error" class="int-test-result fail">
                            {{ signalStatus?.lastError || signalStatus?.error }}
                        </div>
                    </div>

                    <div class="int-actions">
                        <button class="int-btn int-btn-test" @click.stop="refreshSignalStatus">Check status</button>
                        <button
                            v-if="signalCardState === 'error'"
                            class="int-btn int-btn-save"
                            :disabled="signalConnecting"
                            @click.stop="startSignalConnect({ reconnect: true })"
                        >
                            <span v-if="signalConnecting" class="int-spinner"></span>
                            <span v-else>Retry</span>
                        </button>
                        <button class="int-btn int-btn-remove" :disabled="removing === 'signal'" @click.stop="removeIntegration('signal')">
                            <span v-if="removing === 'signal'" class="int-spinner int-spinner-danger"></span>
                            <span v-else>{{ signalCardState === 'connected' ? 'Disconnect' : 'Cancel' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div v-if="showWhatsAppQrModal" class="int-modal-backdrop" @click.self="closeWhatsAppQrModal">
                <div class="int-modal">
                    <div class="int-modal-head">
                        <div>
                            <h3>Connect WhatsApp</h3>
                            <p>Scan this QR code from Linked Devices in WhatsApp to finish linking OrionAI.</p>
                        </div>
                        <button class="int-modal-close" type="button" @click="closeWhatsAppQrModal">✕</button>
                    </div>

                    <div class="int-modal-body">
                        <div v-if="whatsappStatus?.qrImageUrl" class="int-signal-qr-modal">
                            <img :src="whatsappQrStableSrc" alt="WhatsApp QR code" class="int-signal-qr-image int-signal-qr-image--modal" />
                        </div>
                        <div v-else class="int-signal-qr-placeholder int-signal-qr-placeholder--modal">
                            <span class="int-spinner"></span>
                            <span>Preparing QR code...</span>
                        </div>

                        <ol class="int-steps-list int-steps-list--compact">
                            <li>Open WhatsApp on your phone</li>
                            <li>Open Linked Devices</li>
                            <li>Scan this QR code</li>
                        </ol>

                        <div v-if="whatsappStatus?.lastError || whatsappStatus?.error" class="int-test-result fail">
                            {{ whatsappStatus?.lastError || whatsappStatus?.error }}
                        </div>
                    </div>

                    <div class="int-actions">
                        <button class="int-btn int-btn-test" @click.stop="refreshWhatsAppStatus">Check status</button>
                        <button
                            v-if="whatsappCardState === 'error'"
                            class="int-btn int-btn-save"
                            :disabled="whatsappConnecting"
                            @click.stop="startWhatsAppConnect({ reconnect: true })"
                        >
                            <span v-if="whatsappConnecting" class="int-spinner"></span>
                            <span v-else>Retry</span>
                        </button>
                        <button class="int-btn int-btn-remove" :disabled="removing === 'whatsapp'" @click.stop="removeIntegration('whatsapp')">
                            <span v-if="removing === 'whatsapp'" class="int-spinner int-spinner-danger"></span>
                            <span v-else>{{ whatsappCardState === 'connected' ? 'Disconnect' : 'Cancel' }}</span>
                        </button>
                    </div>
                </div>
            </div>
        </transition>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, nextTick, watch } from 'vue'
import { onUnmounted } from 'vue'
import api from '../../services/api'
import { store } from '../../stores/app'
import { useIntegrationHealth } from '../../composables/useIntegrationHealth'
const emit = defineEmits(['close', 'connected', 'openModule'])

const props = defineProps({
    focusType: { type: String, default: null },
})

const { getStatus: getHealthStatus } = useIntegrationHealth()

const search       = ref('')
const expandedType = ref(null)
const saving       = ref(null)
const testing      = ref(null)
const removing     = ref(null)
const testResults  = reactive({})
const connected    = reactive({})

const oauthEmails = reactive({ gmail: null, google_docs: null, google_sheets: null, google_calendar: null })
const secretVisibility = reactive({})
const signalStatus = ref(null)
const signalQrModalOpen = ref(false)
const whatsappStatus = ref(null)
const whatsappQrModalOpen = ref(false)
const whatsappQrStableSrc = ref('')
let signalPollTimer = null
let whatsappPollTimer = null

const cards = [
  {
    type:  'slack',
    name:  'Slack',
    desc:  'Read and send messages as yourself',
    color: '#4A154B',
    img:   '/app-icons/slack.svg',
  },
//   {
//     type:  'notion',
//     name:  'Notion',
//     desc:  'Create pages and update databases',
//     color: '#000000',
//     img:   'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
//   },
  {
    type:  'jira',
    name:  'Jira',
    desc:  'Create and track issues automatically',
    color: '#FFFFFF',
    img: 'https://w7.pngwing.com/pngs/992/738/png-transparent-jira-hd-logo-thumbnail.png',
  },
  {
    type:  'gmail',
    name:  'Gmail',
    desc:  'Send from your real Gmail account',
    color: '#FFFFFF',
    img: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  },
  {
    type:  'google_docs',
    name:  'Google Docs',
    desc:  'Edit Google Docs in a native OrionAI workspace',
    color: '#4285F4',
    img:   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Google_Docs_logo_%282014-2020%29.svg/1920px-Google_Docs_logo_%282014-2020%29.svg.png',
  },
  {
    type:  'google_sheets',
    name:  'Google Sheets',
    desc:  'Use a native OrionAI spreadsheet workspace for Google Sheets',
    color: '#FFFFFF',
    img:   'https://e7.pngegg.com/pngimages/1011/42/png-clipart-g-suite-google-docs-google-sheets-software-suite-google-rectangle-logo-thumbnail.png',
  },
  {
    type:  'database',
    name:  'Database',
    desc:  'Connect PostgreSQL, MySQL, MongoDB or SQLite',
    color: '#FFFFFF',
    img: 'https://e7.pngegg.com/pngimages/931/769/png-clipart-database-icon-database-free-blue-background-blue-angle.png',
  },
//   {
//     type:  'razorpay',
//     name:  'Razorpay',
//     desc:  'Query payouts and trigger payment workflows',
//     color: '#072654',
//     emoji: '₹',
//   },
  {
    type:  'webhook',
    name:  'Custom Webhook',
    desc:  'POST agent data to any endpoint',
    color: '#6366f1',
    emoji: '🔗',
  },
  {
    type:  'google_calendar',
    name:  'Google Calendar',
    desc:  'View, create and manage calendar events',
    color: '#1a73e8',
    img:   '/app-icons/google-calendar.svg',
  },
  {
    type:  'telegram',
    name:  'Telegram',
    desc:  'Read and send messages via your Telegram account',
    color: '#FFFFFF',
    img:   'https://cdn.worldvectorlogo.com/logos/telegram-1.svg',
  },
  {
    type:  'signal',
    name:  'Signal',
    desc:  'Connect Signal securely inside OrionAI',
    color: '#FFFFFF',
    img: 'https://static.vecteezy.com/system/resources/previews/068/842/068/non_2x/signal-icon-logo-signal-app-transparent-background-free-png.png',
  },
  {
    type:  'whatsapp',
    name:  'WhatsApp',
    desc:  'Connect WhatsApp securely in OrionAI',
    color: '#FFFFFF',
    img: 'https://e7.pngegg.com/pngimages/551/579/png-clipart-whats-app-logo-whatsapp-logo-whatsapp-cdr-leaf-thumbnail.png',
  },
]

const INITIAL_FORMS = {
    // notion:  { apiToken: '', databaseId: '' },
    jira:    { domain: '', email: '', apiToken: '', projectKey: '' },
    database:{ vendor: 'postgres', connectionString: '', filePath: '', ssl: false, defaultSchema: 'public', readOnly: true },
    // razorpay:{ keyId: '', keySecret: '', accountNumber: '', webhookSecret: '' },
    signal:  {},
    webhook: { url: '', method: 'POST', secret: '' },
}

const forms = reactive({
    // notion:  { ...INITIAL_FORMS.notion },
    jira:    { ...INITIAL_FORMS.jira },
    database:{ ...INITIAL_FORMS.database },
    // razorpay:{ ...INITIAL_FORMS.razorpay },
    signal:  { ...INITIAL_FORMS.signal },
    webhook: { ...INITIAL_FORMS.webhook },
})

const filteredCards  = computed(() =>
    search.value
        ? cards.filter(c => c.name.toLowerCase().includes(search.value.toLowerCase()) || c.desc.toLowerCase().includes(search.value.toLowerCase()))
        : cards
)
const SIGNAL_PENDING_STATES = new Set(['creating_account', 'logging_in', 'pending_qr'])
const WHATSAPP_PENDING_STATES = new Set(['creating_account', 'logging_in', 'pending_qr'])
const connectedCount = computed(() => cards.filter(card => getStatus(card.type) === 'connected').length)
const errorCount = computed(() => cards.filter(card => !card.comingSoon && getHealthStatus(card.type) === 'error').length)
const signalCardState = computed(() => getStatus('signal'))
const whatsappCardState = computed(() => getStatus('whatsapp'))
const showSignalQrModal = computed(() =>
    signalQrModalOpen.value && ['pending', 'error'].includes(signalCardState.value)
)
const showWhatsAppQrModal = computed(() =>
    whatsappQrModalOpen.value && ['pending', 'error'].includes(whatsappCardState.value)
)

function getStatus(type) {
    if (type === 'signal') {
        if (signalStatus.value?.connected) return 'connected'
        const loginState = String(signalStatus.value?.loginState || connected.signal?.matrix?.loginState || '').trim()
        if (loginState === 'connected') return 'connected'
        if (SIGNAL_PENDING_STATES.has(loginState)) return 'pending'
        if (loginState === 'error') return 'error'
        return 'disconnected'
    }
    if (type === 'whatsapp') {
        if (whatsappStatus.value?.connected) return 'connected'
        const loginState = String(whatsappStatus.value?.loginState || connected.whatsapp?.matrix?.loginState || '').trim()
        if (loginState === 'connected') return 'connected'
        if (WHATSAPP_PENDING_STATES.has(loginState)) return 'pending'
        if (loginState === 'error') return 'error'
        return 'disconnected'
    }
    return connected[type] ? 'connected' : 'disconnected'
}

function applySignalIntegrationState(statusData = signalStatus.value) {
    const loginState = String(
        statusData?.connected
            ? 'connected'
            : statusData?.loginState || connected.signal?.matrix?.loginState || 'disconnected'
    ).trim()
    if (!statusData && !connected.signal) return

    if (statusData?.connected || connected.signal || SIGNAL_PENDING_STATES.has(loginState) || loginState === 'error') {
        connected.signal = {
            ...(connected.signal || {}),
            type: 'signal',
            name: 'Signal',
            enabled: true,
            transport: 'mautrix',
            connected: Boolean(statusData?.connected),
            matrix: {
                ...(connected.signal?.matrix || {}),
                loginState,
                lastError: statusData?.lastError || statusData?.error || '',
                connectedAt: statusData?.connectedAt || connected.signal?.matrix?.connectedAt || null,
            },
        }
    }
}

function applyWhatsAppIntegrationState(statusData = whatsappStatus.value) {
    const loginState = String(
        statusData?.connected
            ? 'connected'
            : statusData?.loginState || connected.whatsapp?.matrix?.loginState || 'disconnected'
    ).trim()
    if (!statusData && !connected.whatsapp) return

    if (statusData?.connected || connected.whatsapp || WHATSAPP_PENDING_STATES.has(loginState) || loginState === 'error') {
        connected.whatsapp = {
            ...(connected.whatsapp || {}),
            type: 'whatsapp',
            name: 'WhatsApp',
            enabled: true,
            transport: 'mautrix',
            connected: Boolean(statusData?.connected),
            matrix: {
                ...(connected.whatsapp?.matrix || {}),
                loginState,
                lastError: statusData?.lastError || statusData?.error || '',
                connectedAt: statusData?.connectedAt || connected.whatsapp?.matrix?.connectedAt || null,
            },
            whatsapp: {
                ...(connected.whatsapp?.whatsapp || {}),
                connected: Boolean(statusData?.connected),
                profileName: statusData?.profile?.displayName || connected.whatsapp?.whatsapp?.profileName || '',
                avatarUrl: statusData?.profile?.avatarUrl || connected.whatsapp?.whatsapp?.avatarUrl || '',
            },
        }
    }
}

function stopSignalPolling() {
    if (signalPollTimer) {
        clearInterval(signalPollTimer)
        signalPollTimer = null
    }
}

function stopWhatsAppPolling() {
    if (whatsappPollTimer) {
        clearInterval(whatsappPollTimer)
        whatsappPollTimer = null
    }
}

function syncSignalPolling() {
    const loginState = String(signalStatus.value?.loginState || '').trim()
    if (!SIGNAL_PENDING_STATES.has(loginState)) {
        stopSignalPolling()
        return
    }
    if (signalPollTimer) return
    signalPollTimer = setInterval(async () => {
        try {
            await refreshSignalStatus()
        } catch (err) {
            console.debug('Failed to refresh Signal status:', err?.message || err)
        }
    }, 2500)
}

function syncWhatsAppPolling() {
    const loginState = String(whatsappStatus.value?.loginState || '').trim()
    if (!WHATSAPP_PENDING_STATES.has(loginState)) {
        stopWhatsAppPolling()
        return
    }
    if (whatsappPollTimer) return
    whatsappPollTimer = setInterval(async () => {
        try {
            await refreshWhatsAppStatus()
        } catch (err) {
            console.debug('Failed to refresh WhatsApp status:', err?.message || err)
        }
    }, 2500)
}

function syncStableQrSrc(currentValueRef, nextUrl) {
    const normalizedNext = String(nextUrl || '').trim()
    if (!normalizedNext) {
        currentValueRef.value = ''
        return
    }
    if (currentValueRef.value === normalizedNext) return
    currentValueRef.value = normalizedNext
}
function openSignalQrModal() {
    signalQrModalOpen.value = true
}

function closeSignalQrModal() {
    signalQrModalOpen.value = false
}

function openWhatsAppQrModal() {
    whatsappQrModalOpen.value = true
}

function closeWhatsAppQrModal() {
    whatsappQrModalOpen.value = false
}

function secretKey(section, field) {
    return `${section}.${field}`
}

function isSecretVisible(section, field) {
    return Boolean(secretVisibility[secretKey(section, field)])
}

function toggleSecretVisibility(section, field) {
    const key = secretKey(section, field)
    secretVisibility[key] = !secretVisibility[key]
}

function secretInputType(section, field) {
    return isSecretVisible(section, field) ? 'text' : 'password'
}

function secretToggleLabel(section, field) {
    return `${isSecretVisible(section, field) ? 'Hide' : 'Show'} ${field}`
}

async function toggleExpand(type) {
    if (cards.find(c => c.type === type)?.comingSoon) return
    expandedType.value = expandedType.value === type ? null : type
    testResults[type]  = null
    await nextTick()
    applyAutofillGuards()
}

async function scrollToCard(type) {
    if (!type || cards.find(c => c.type === type)?.comingSoon) return
    expandedType.value = type
    testResults[type]  = null
    await nextTick()
    applyAutofillGuards()
    const el = document.getElementById(`int-card-${type}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function extractEmail(int) {
    if (!int) return null
    if (int.type === 'gmail')            return int.gmail?.userEmail || null
    if (int.type === 'google_docs')      return int.googleDocs?.userEmail || null
    if (int.type === 'google_sheets')    return int.googleSheets?.userEmail || null
    if (int.type === 'google_calendar')  return int.googleCalendar?.userEmail || null
    return null
}

function resetForms() {
    Object.entries(INITIAL_FORMS).forEach(([type, defaults]) => {
        if (forms[type]) Object.assign(forms[type], JSON.parse(JSON.stringify(defaults)))
    })
}

function applyAutofillGuards() {
    const fields = document.querySelectorAll('.integrations-page input, .integrations-page select')
    fields.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        node.setAttribute('autocomplete', 'off')
        node.setAttribute('autocapitalize', 'off')
        node.setAttribute('autocorrect', 'off')
        node.setAttribute('spellcheck', 'false')
        node.setAttribute('data-lpignore', 'true')
        node.setAttribute('data-form-type', 'other')
    })

    const secretFields = document.querySelectorAll('.integrations-page input[type="password"]')
    secretFields.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        node.setAttribute('autocomplete', 'new-password')
        node.setAttribute('data-form-type', 'other')
    })
}

function getIntegrationSnapshot() {
    return Object.values(connected)
}

function notifyIntegrationsUpdated() {
    const integrations = getIntegrationSnapshot()
    window.dispatchEvent(new CustomEvent('orion:integrations-updated', {
        detail: { integrations },
    }))
    emit('connected', integrations)
}

async function loadIntegrations() {
    search.value = ''
    expandedType.value = null
    Object.keys(testResults).forEach((key) => delete testResults[key])
    resetForms()
    const res = await api.get('/api/integrations')
    Object.keys(connected).forEach((key) => delete connected[key])
    oauthEmails.gmail = null
    oauthEmails.google_docs = null
    oauthEmails.google_sheets = null
    oauthEmails.google_calendar = null
    signalStatus.value = null
    whatsappStatus.value = null
    for (const int of res.data) {
        connected[int.type] = int
        const email = extractEmail(int)
        if (email) oauthEmails[int.type] = email
        if (forms[int.type] && int[int.type]) Object.assign(forms[int.type], int[int.type])
        if (int.type === 'signal' && !signalStatus.value) {
            signalStatus.value = {
                connected: Boolean(int.connected || int.matrix?.loginState === 'connected'),
                loginState: int.matrix?.loginState || 'disconnected',
                lastError: int.matrix?.lastError || '',
                error: int.matrix?.lastError || '',
                connectedAt: int.matrix?.connectedAt || null,
                roomCount: 0,
                unreadCount: 0,
                profile: null,
                qrImageUrl: null,
            }
        }
        if (int.type === 'whatsapp' && !whatsappStatus.value) {
            whatsappStatus.value = {
                connected: Boolean(int.connected || int.matrix?.loginState === 'connected'),
                loginState: int.matrix?.loginState || 'disconnected',
                lastError: int.matrix?.lastError || '',
                error: int.matrix?.lastError || '',
                connectedAt: int.matrix?.connectedAt || null,
                roomCount: 0,
                unreadCount: 0,
                profile: null,
                qrImageUrl: null,
            }
        }
    }
    try {
        await refreshSignalStatus()
    } catch (err) {
        console.debug('Failed to refresh Signal status during integrations load:', err?.message || err)
    }
    try {
        await refreshWhatsAppStatus()
    } catch (err) {
        console.debug('Failed to refresh WhatsApp status during integrations load:', err?.message || err)
    }
    await nextTick()
    applyAutofillGuards()
}

onMounted(async () => {
    try { await loadIntegrations() } catch (e) { console.error('Failed to load integrations:', e) }
    setTimeout(applyAutofillGuards, 100)
    if (props.focusType) setTimeout(() => scrollToCard(props.focusType), 150)
})

watch(
    () => store.user?.username,
    async () => {
        try { await loadIntegrations() } catch (e) { console.error('Failed to reload integrations:', e) }
        setTimeout(applyAutofillGuards, 100)
    }
)

async function saveIntegration(type) {
    saving.value      = type
    testResults[type] = null
    try {
        const res = await api.post(`/api/integrations/${type}`, {
            name: cards.find(c => c.type === type)?.name || type,
            enabled: true,
            [type]: forms[type],
        })
        connected[type]   = res.data.integration
        testResults[type] = { ok: true, message: 'Saved successfully!' }
        notifyIntegrationsUpdated()
    } catch (err) {
        testResults[type] = { ok: false, error: err.response?.data?.error || 'Save failed' }
    } finally { saving.value = null }
}

onUnmounted(() => {
    stopWhatsAppPolling()
    stopSignalPolling()
})

async function testConnection(type) {
    await saveIntegration(type)
    testing.value     = type
    testResults[type] = null
    try {
        const res = await api.post(`/api/integrations/${type}/test`)
        testResults[type] = { ok: res.data.ok, message: res.data.message }
    } catch (err) {
        testResults[type] = { ok: false, error: err.response?.data?.error || 'Test failed' }
    } finally { testing.value = null }
}

// ── OAuth popup helper ────────────────────────────────────
function openOAuthPopup(url, windowName, successType) {
    const popup = window.open(url, windowName, 'width=600,height=700,left=' + (window.screenX + 200) + ',top=' + (window.screenY + 100))
    return new Promise((resolve) => {
        const handler = async (event) => {
            if (event.data?.type !== successType) return
            window.removeEventListener('message', handler)
            popup?.close()
            clearInterval(poll)
            await loadIntegrations()
            notifyIntegrationsUpdated()
            resolve(true)
        }
        window.addEventListener('message', handler)
        const poll = setInterval(() => {
            if (popup?.closed) {
                clearInterval(poll)
                window.removeEventListener('message', handler)
                // reload anyway in case the redirect set the token
                loadIntegrations().then(() => notifyIntegrationsUpdated())
                resolve(false)
            }
        }, 1000)
    })
}

// ── Gmail OAuth ───────────────────────────────────────────
const gmailConnecting = ref(false)
const googleDocsConnecting = ref(false)
const googleSheetsConnecting = ref(false)
const signalConnecting = ref(false)

async function refreshSignalStatus() {
    const previousConnected = Boolean(signalStatus.value?.connected)
    const previousState = String(signalStatus.value?.loginState || '').trim()
    try {
        const { data } = await api.get('/api/signal/status')
        signalStatus.value = data
    } catch (err) {
        signalStatus.value = {
            connected: false,
            loginState: 'error',
            lastError: err.response?.data?.error || err.message || 'Signal status unavailable',
            error: err.response?.data?.error || err.message || 'Signal status unavailable',
            roomCount: 0,
            unreadCount: 0,
            profile: null,
            qrImageUrl: null,
        }
    }
    applySignalIntegrationState(signalStatus.value)
    if (
        signalCardState.value === 'pending' &&
        (!SIGNAL_PENDING_STATES.has(previousState) || signalConnecting.value)
    ) {
        signalQrModalOpen.value = true
    }
    if (signalCardState.value === 'connected') {
        signalQrModalOpen.value = false
    }
    syncSignalPolling()
    if (
        previousConnected !== Boolean(signalStatus.value?.connected) ||
        previousState !== String(signalStatus.value?.loginState || '').trim()
    ) {
        notifyIntegrationsUpdated()
    }
    if (
        signalStatus.value?.connected &&
        (!previousConnected || previousState !== 'connected')
    ) {
        testResults.signal = { ok: true, message: 'Signal connected successfully!' }
    }
}

async function refreshWhatsAppStatus() {
    const previousConnected = Boolean(whatsappStatus.value?.connected)
    const previousState = String(whatsappStatus.value?.loginState || '').trim()

    try {
        const { data } = await api.get('/api/whatsapp/status')
        whatsappStatus.value = data
        syncStableQrSrc(whatsappQrStableSrc, data?.qrImageUrl)
    } catch (err) {
        whatsappStatus.value = {
            connected: false,
            loginState: 'error',
            lastError: err.response?.data?.error || err.message || 'WhatsApp status unavailable',
            error: err.response?.data?.error || err.message || 'WhatsApp status unavailable',
            roomCount: 0,
            unreadCount: 0,
            profile: null,
            qrImageUrl: null,
        }
    }

    applyWhatsAppIntegrationState(whatsappStatus.value)

    if (
        whatsappCardState.value === 'pending' &&
        (!WHATSAPP_PENDING_STATES.has(previousState) || whatsappConnecting.value)
    ) {
        whatsappQrModalOpen.value = true
    }

    if (whatsappCardState.value === 'connected') {
        whatsappQrModalOpen.value = false
    }

    syncWhatsAppPolling()

    if (
        previousConnected !== Boolean(whatsappStatus.value?.connected) ||
        previousState !== String(whatsappStatus.value?.loginState || '').trim()
    ) {
        notifyIntegrationsUpdated()
    }

    if (
        whatsappStatus.value?.connected &&
        (!previousConnected || previousState !== 'connected')
    ) {
        testResults.whatsapp = { ok: true, message: 'WhatsApp connected successfully!' }
    }
}

async function startSignalConnect(options = {}) {
    const reconnect = Boolean(options?.reconnect)
    signalConnecting.value = true
    testResults.signal = null
    signalQrModalOpen.value = true
    try {
        const { data } = await api.post('/api/signal/connect', {
            reconnect,
        })
        if (data.integration) connected.signal = data.integration
        signalStatus.value = data.status || null
        applySignalIntegrationState(signalStatus.value)
        syncSignalPolling()
        if (signalCardState.value === 'connected') {
            signalQrModalOpen.value = false
            testResults.signal = { ok: true, message: 'Signal connected successfully!' }
        } else if (signalCardState.value === 'pending') {
            testResults.signal = { ok: true, message: 'Scan the QR code to finish linking Signal.' }
        } else if (signalCardState.value === 'error') {
            testResults.signal = {
                ok: false,
                error: signalStatus.value?.lastError || signalStatus.value?.error || 'Signal connect failed',
            }
        }
        notifyIntegrationsUpdated()
    } catch (err) {
        testResults.signal = { ok: false, error: err.response?.data?.error || 'Signal connect failed' }
        await refreshSignalStatus()
    } finally {
        signalConnecting.value = false
    }
}

async function startGmailOAuth() {
    gmailConnecting.value = true
    try {
        const res = await api.get('/api/integrations/gmail/oauth/start')
        await openOAuthPopup(res.data.url, 'gmail-oauth', 'gmail-oauth-success')
    } catch (err) { console.error('Gmail OAuth failed:', err) }
    finally { gmailConnecting.value = false }
}

async function startGoogleDocsOAuth() {
    googleDocsConnecting.value = true
    try {
        const res = await api.get('/api/integrations/google-docs/oauth/start')
        await openOAuthPopup(res.data.url, 'gdocs-oauth', 'gdocs-oauth-success')
    } catch (err) { console.error('Google Docs OAuth failed:', err) }
    finally { googleDocsConnecting.value = false }
}

async function startGoogleSheetsOAuth() {
    googleSheetsConnecting.value = true
    try {
        const res = await api.get('/api/integrations/google-sheets/oauth/start')
        await openOAuthPopup(res.data.url, 'gsheets-oauth', 'gsheets-oauth-success')
    } catch (err) { console.error('Google Sheets OAuth failed:', err) }
    finally { googleSheetsConnecting.value = false }
}

// ── Google Calendar OAuth ─────────────────────────────────
const calendarConnecting = ref(false)
async function startCalendarOAuth() {
    calendarConnecting.value = true
    try {
        const res = await api.get('/api/integrations/google-calendar/oauth/start')
        await openOAuthPopup(res.data.url, 'gcal-oauth', 'gcal-oauth-success')
    } catch (err) { console.error('Calendar OAuth failed:', err) }
    finally { calendarConnecting.value = false }
}

// ── Slack OAuth ───────────────────────────────────────────
const slackConnecting = ref(false)
async function startSlackOAuth() {
  slackConnecting.value = true
  try {
    // ✅ Exactly like Gmail — get URL from API, open as popup
    const res = await api.get('/api/integrations/slack/oauth/start')
    await openOAuthPopup(res.data.url, 'slack-oauth', 'slack-oauth-success')
  } catch (err) {
    console.error('Slack OAuth failed:', err)
  } finally {
    slackConnecting.value = false
  }
}

const whatsappConnecting = ref(false)

async function startWhatsAppConnect(options = {}) {
    const reconnect = Boolean(options?.reconnect)
    whatsappConnecting.value = true
    testResults.whatsapp = null
    whatsappQrModalOpen.value = true
    

    try {
        const { data } = await api.post('/api/whatsapp/connect', { reconnect })

        if (data.integration) connected.whatsapp = data.integration
        whatsappStatus.value = data.status || null
        syncStableQrSrc(whatsappQrStableSrc, data?.status?.qrImageUrl)

        applyWhatsAppIntegrationState(whatsappStatus.value)
        syncWhatsAppPolling()

        if (whatsappCardState.value === 'connected') {
            whatsappQrModalOpen.value = false
            testResults.whatsapp = { ok: true, message: 'WhatsApp connected successfully!' }
        } else if (whatsappCardState.value === 'pending') {
            testResults.whatsapp = { ok: true, message: 'Scan the QR code to finish linking WhatsApp.' }
        } else if (whatsappCardState.value === 'error') {
            testResults.whatsapp = {
                ok: false,
                error: whatsappStatus.value?.lastError || whatsappStatus.value?.error || 'WhatsApp connect failed',
            }
        }

        notifyIntegrationsUpdated()
    } catch (err) {
        testResults.whatsapp = {
            ok: false,
            error: err.response?.data?.error || 'WhatsApp connect failed',
        }
        await refreshWhatsAppStatus()
    } finally {
        whatsappConnecting.value = false
    }
}

// ── Remove ────────────────────────────────────────────────
async function removeIntegration(type) {
    removing.value    = type
    testResults[type] = null
    try {
        if (type === 'signal') {
            await api.post('/api/signal/disconnect')
            stopSignalPolling()
            signalQrModalOpen.value = false
            signalStatus.value = {
                connected: false,
                loginState: 'disconnected',
                lastError: '',
                error: '',
                roomCount: 0,
                unreadCount: 0,
                profile: null,
                qrImageUrl: null,
            }
        } else if (type === 'whatsapp') {
            await api.post('/api/whatsapp/disconnect')
            stopWhatsAppPolling()
            whatsappQrModalOpen.value = false
            whatsappStatus.value = {
                connected: false,
                loginState: 'disconnected',
                lastError: '',
                error: '',
                roomCount: 0,
                unreadCount: 0,
                profile: null,
                qrImageUrl: null,
            }
        } else {
            await api.delete(`/api/integrations/${type}`)
        }
        delete connected[type]
        oauthEmails[type] = null
        if (INITIAL_FORMS[type]) Object.assign(forms[type], INITIAL_FORMS[type])
        expandedType.value = null
        notifyIntegrationsUpdated()
    } catch (e) {
        console.log(e)
        testResults[type] = { ok: false, error: 'Remove failed — please try again.' }
    } finally { removing.value = null }
}
</script>

<style scoped>
.integrations-page {
    position: absolute;
    inset: 0;
    left: 0;
    background: var(--bg-base);
    z-index: 100;
    min-width: 0;
    overflow-y: auto;
    padding: clamp(24px, 3vw, 34px) clamp(20px, 3.5vw, 42px) 72px;
}

.int-autofill-trap {
    position: absolute;
    pointer-events: none;
    opacity: 0;
    width: 0;
    height: 0;
    overflow: hidden;
}

.int-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 30px;
}
.int-header-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
.int-back-btn {
    width: 42px; height: 42px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-default); background: var(--bg-elevated);
    color: var(--text-secondary); display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.15s;
}
.int-back-btn:hover { background: var(--bg-elevated); border-color: var(--border-strong); color: var(--text-primary); }
.int-title { font-size: 30px; font-weight: 700; color: var(--text-primary); margin: 0 0 6px; letter-spacing: -0.03em; }
.int-subtitle { font-size: 14px; color: var(--text-secondary); margin: 0; }
.int-header-badges { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.int-header-badge {
    display: flex; align-items: center; gap: 7px;
    font-size: 12px; color: var(--success);
    background: var(--bg-elevated); border: 1px solid var(--border-default);
    padding: 9px 14px; border-radius: var(--radius-sm);
}
.int-header-badge--error {
    color: var(--danger);
    background: rgba(255, 107, 127, 0.07);
    border-color: rgba(255, 107, 127, 0.22);
}
.badge-dot-warn {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--danger); display: inline-block;
    animation: warn-pulse 2s infinite;
}
@keyframes warn-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}
.int-search-wrap { position: relative; margin-bottom: 28px; max-width: 420px; }
.int-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); }
.int-search {
    width: 100%; padding: 13px 14px 13px 40px;
    background: var(--bg-elevated); border: 1px solid var(--border-default);
    border-radius: var(--radius-sm); color: var(--text-primary); font-size: 13px;
    outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s;
}
.int-search:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(79, 140, 255, 0.08); }

.int-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 18px; }
.int-card {
    background: var(--bg-surface); border: 1px solid var(--border-default);
    border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; transition: all 0.15s;
}
.int-card:hover { border-color: var(--border-strong); }
.int-card.connected {
    border-color: rgba(47, 211, 157, 0.26);
    background: var(--bg-surface);
}
.int-card.health-error {
    border-color: rgba(255, 107, 127, 0.3);
    background: var(--bg-surface);
}
.int-card.expanded { border-color: rgba(79, 140, 255, 0.24); }
.int-card-top { display: flex; align-items: center; gap: 16px; padding: 22px 22px; min-width: 0; }
.int-card-icon {
    width: 54px; height: 54px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; padding: 10px; box-sizing: border-box; overflow: hidden;
    border: 1px solid var(--border-subtle);
}
.int-card-icon--gmail {
    background: linear-gradient(180deg, #ffffff, #f7f8fc) !important;
    border-color: rgba(15,23,42,0.08);
}
.int-card-icon--google_docs {
    background: linear-gradient(180deg, #eef4ff, #dbeafe) !important;
    border-color: rgba(66,133,244,0.18);
}
/* .int-card-icon--razorpay {
    background: linear-gradient(180deg, #1f4fd1, #12307f) !important;
    border-color: rgba(31,79,209,0.28);
} */
.int-logo { width: 26px; height: 26px; object-fit: contain; border-radius: 4px; }
.int-card-icon--gmail .int-logo { width: 29px; height: 29px; }
.int-card-icon--google_docs .int-logo { width: 28px; height: 28px; }
.int-brand-icon {
    display: block;
    color: #fff;
}
/* .int-brand-icon--razorpay {
    width: 22px;
    height: 22px;
    filter: drop-shadow(0 1px 2px rgba(3, 7, 18, 0.22));
} */
.int-emoji { font-size: 22px; }
.int-card-info { flex: 1; min-width: 0; }
.int-card-name { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.int-card-desc { font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
.int-card-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.int-chevron { color: var(--text-muted); transition: transform 0.2s; }
.int-chevron.rotated { transform: rotate(180deg); }
.badge-connected { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--success); font-weight: 600; }
.badge-pending {
    font-size: 11px;
    color: #f7c96b;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(247, 201, 107, 0.2);
    background: rgba(247, 201, 107, 0.08);
}
.badge-error {
    font-size: 11px;
    color: var(--danger);
    font-weight: 600;
    padding: 4px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid rgba(255, 107, 127, 0.18);
    background: rgba(255, 107, 127, 0.08);
}
.badge-disconnected { font-size: 11px; color: var(--text-muted); }
.badge-soon { font-size: 10px; font-weight: 700; background: rgba(242, 198, 109, 0.12); color: var(--accent-warm); padding: 4px 9px; border-radius: var(--radius-sm); border: 1px solid rgba(242, 198, 109, 0.18); }
.badge-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); display: inline-block; }
.badge-dot.green { background: #10b981; }

.int-card-form { padding: 0 22px 22px; border-top: 1px solid var(--border-subtle); }
.int-field-group { margin-bottom: 14px; }
.int-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.int-label {
    display: flex; align-items: center; justify-content: space-between;
    font-size: 11px; font-weight: 700; color: var(--accent-warm);
    text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px;
}
.int-label-opt { font-weight: 400; text-transform: none; color: var(--text-muted); letter-spacing: 0; }
.int-help-link { font-size: 11px; color: var(--accent); text-decoration: none; font-weight: 400; text-transform: none; letter-spacing: 0; }
.int-help-link:hover { text-decoration: underline; }
.int-input {
    width: 100%; padding: 12px 14px;
    background: var(--bg-elevated); border: 1px solid var(--border-default);
    border-radius: var(--radius-sm); color: var(--text-primary); font-size: 13px;
    outline: none; box-sizing: border-box; transition: border-color 0.15s, box-shadow 0.15s;
    font-family: var(--font-mono);
}
.int-input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px rgba(79, 140, 255, 0.08); }
select.int-input { cursor: pointer; }
.int-secret-wrap {
    position: relative;
}
.int-input--secret {
    padding-right: 42px;
}
.int-secret-toggle {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.int-secret-toggle:hover {
    background: var(--bg-hover);
    border-color: var(--border-default);
    color: var(--text-primary);
}

.int-setup-steps {
    background: var(--bg-elevated); border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md); padding: 14px 16px; margin-bottom: 14px;
}
.int-steps-title { font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
.int-steps-list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--text-secondary); line-height: 1.8; }

.int-oauth-block {
    display: flex; align-items: center; gap: 14px;
    background: rgba(255, 255, 255, 0.035); border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg); padding: 18px; margin-bottom: 14px;
}
.int-oauth-text { flex: 1; min-width: 0; }
.int-oauth-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.int-oauth-desc { font-size: 12px; color: var(--text-muted); }
.int-signal-panel {
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: 18px;
    margin-bottom: 14px;
}
.int-signal-panel--error {
    border-color: rgba(255, 107, 127, 0.18);
    background: rgba(255, 107, 127, 0.06);
}
.int-signal-panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
}
.int-signal-qr-preview {
    display: grid;
    grid-template-columns: 144px 1fr;
    gap: 14px;
    align-items: center;
}
.int-signal-qr-image {
    width: 144px;
    height: 144px;
    object-fit: contain;
    border-radius: var(--radius-md);
    padding: 10px;
    background: #fff;
    border: 1px solid rgba(255, 255, 255, 0.12);
}
.int-signal-qr-image--modal {
    width: 240px;
    height: 240px;
}
.int-signal-qr-placeholder {
    width: 144px;
    height: 144px;
    border-radius: var(--radius-md);
    border: 1px dashed var(--border-default);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
    font-size: 12px;
}
.int-signal-qr-placeholder--modal {
    width: 240px;
    height: 240px;
}
.int-steps-list--compact {
    padding-left: 18px;
    margin: 0;
}

.int-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.int-btn {
    padding: 10px 16px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600;
    cursor: pointer; border: 1px solid transparent; display: flex; align-items: center;
    gap: 6px; transition: all 0.15s;
}
.int-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.int-btn-test { background: rgba(255, 255, 255, 0.045); border-color: var(--border-default); color: var(--text-primary); }
.int-btn-test:hover:not(:disabled) { background: rgba(255, 255, 255, 0.07); border-color: var(--border-strong); transform: translateY(-1px); }
.int-btn-save { background: var(--accent); color: white; border-color: rgba(255,255,255,0.12); }
.int-btn-save:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--shadow-accent); }
.int-btn-remove { background: transparent; border-color: rgba(255,107,127,0.26); color: var(--danger); margin-left: auto; }
.int-btn-remove:hover:not(:disabled) { background: rgba(255,107,127,0.08); }

.int-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
    border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block;
}
.int-btn-test .int-spinner { border-color: rgba(0,0,0,0.15); border-top-color: var(--text-primary); }
.int-spinner-danger { border-color: rgba(239,68,68,0.2) !important; border-top-color: #ef4444 !important; }
@keyframes spin { to { transform: rotate(360deg); } }

.int-test-result { margin-top: 10px; padding: 9px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.int-test-result.ok { background: rgba(47,211,157,0.1); color: var(--success); border: 1px solid rgba(47,211,157,0.18); }
.int-test-result.fail { background: rgba(255,107,127,0.08); color: var(--danger); border: 1px solid rgba(255,107,127,0.18); }

.int-expand-enter-active, .int-expand-leave-active { transition: all 0.2s ease; overflow: hidden; }
.int-expand-enter-from, .int-expand-leave-to { opacity: 0; max-height: 0; padding-top: 0; padding-bottom: 0; }
.int-expand-enter-to, .int-expand-leave-from { opacity: 1; max-height: 600px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.int-oauth-connected {
    padding: 12px 14px;
    background: rgba(47,211,157,0.08); border: 1px solid rgba(47,211,157,0.18);
    border-radius: var(--radius-md); margin-bottom: 12px;
}
.int-oauth-connected-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex-wrap: wrap;
}
.int-oauth-connected-icon { font-size: 18px; flex-shrink: 0; }
.int-oauth-connected-info { flex: 1 1 180px; min-width: 0; }
.int-oauth-connected-title { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.int-oauth-connected-email {
    font-size: 13px;
    font-weight: 600;
    color: #96f3cd;
    overflow-wrap: anywhere;
    word-break: break-word;
}
.int-oauth-reconnect-btn {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 11.5px; padding: 7px 11px; border-radius: var(--radius-sm);
    border: 1px solid var(--border-default); background: rgba(255,255,255,0.045);
    color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
}
.int-oauth-reconnect-btn:hover { background: rgba(255,255,255,0.07); border-color: var(--border-strong); color: var(--text-primary); }
.int-oauth-icon-img { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }

/* Google OAuth button */
.int-oauth-btn-google {
    background: #fff; color: #3c4043; border: 1px solid #dadce0;
    font-weight: 500; font-size: 13px; padding: 8px 14px; border-radius: 4px;
    display: flex; align-items: center; gap: 8px; white-space: nowrap;
    cursor: pointer; transition: box-shadow 0.15s;
}
.int-oauth-btn-google:hover:not(:disabled) { box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
.int-oauth-btn-google:disabled { opacity: 0.6; cursor: not-allowed; }

/* Slack OAuth button — uses Slack brand colors */
.int-oauth-btn-slack {
    background: #4A154B; color: white; border: none;
    font-weight: 600; font-size: 13px; padding: 9px 16px; border-radius: 6px;
    display: flex; align-items: center; gap: 8px; white-space: nowrap;
    cursor: pointer; transition: opacity 0.15s; flex-shrink: 0;
}
.int-oauth-btn-slack:hover:not(:disabled) { opacity: 0.88; }
.int-oauth-btn-slack:disabled { opacity: 0.5; cursor: not-allowed; }

.int-oauth-spinner {
    display: inline-block; width: 14px; height: 14px;
    border: 2px solid #dadce0; border-top-color: #4285F4;
    border-radius: 50%; animation: oauth-spin 0.7s linear infinite;
}
@keyframes oauth-spin { to { transform: rotate(360deg); } }

.int-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 10, 20, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 120;
}

.int-modal {
    width: min(100%, 520px);
    background: var(--bg-surface);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: var(--radius-lg);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.42);
    padding: 22px;
}

.int-modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}

.int-modal-head h3 {
    margin: 0 0 6px;
    font-size: 22px;
    color: var(--text-primary);
}

.int-modal-head p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
}

.int-modal-close {
    width: 38px;
    height: 38px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-default);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
}

.int-modal-close:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-primary);
}

.int-modal-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    margin-bottom: 18px;
}

.int-signal-qr-modal {
    display: flex;
    align-items: center;
    justify-content: center;
}

[data-theme="light"] .int-input { background: white; }
[data-theme="light"] .int-setup-steps { background: #f8f8fc; }
[data-theme="light"] .int-card-icon--gmail .int-logo {
    filter: saturate(1.03) contrast(1.03);
}
[data-theme="light"] .int-secret-toggle:hover {
    background: #f6f7ff;
}

@media (max-width: 780px) {
    .int-signal-qr-preview {
        grid-template-columns: 1fr;
    }

    .int-signal-qr-image,
    .int-signal-qr-placeholder {
        width: 100%;
        max-width: 220px;
        justify-self: center;
    }

    .int-modal {
        padding: 18px;
    }

    .int-signal-qr-image--modal,
    .int-signal-qr-placeholder--modal {
        width: min(100%, 240px);
        height: auto;
        aspect-ratio: 1;
    }
}

@media (max-width: 1366px) {
    .integrations-page {
        padding-inline: clamp(18px, 2.5vw, 28px);
    }

    .int-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    }
}

@media (max-width: 1024px) {
    .integrations-page {
        padding: 22px 18px calc(72px + env(safe-area-inset-bottom, 0px));
    }

    .int-header {
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: 24px;
    }

    .int-header-left,
    .int-header-badges {
        width: 100%;
    }

    .int-header-badges {
        flex-wrap: wrap;
    }

    .int-search-wrap {
        max-width: none;
    }

    .int-card-top {
        align-items: flex-start;
        flex-wrap: wrap;
    }

    .int-card-right {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
    }

    .int-field-row,
    .int-signal-qr-preview {
        grid-template-columns: 1fr;
    }

    .int-oauth-block,
    .int-signal-panel-head {
        flex-direction: column;
        align-items: flex-start;
    }

    .int-oauth-connected-row {
        gap: 8px;
    }

    .int-oauth-reconnect-btn,
    .int-btn-remove {
        margin-left: 0;
    }

    .int-modal-backdrop {
        padding: 18px;
    }

    .int-modal {
        max-height: min(88dvh, 720px);
        overflow: auto;
    }
}

@media (max-width: 640px) {
    .integrations-page {
        padding: 18px 14px calc(64px + env(safe-area-inset-bottom, 0px));
    }

    .int-title {
        font-size: 24px;
    }

    .int-subtitle {
        line-height: 1.5;
    }

    .int-grid {
        grid-template-columns: 1fr;
    }

    .int-card,
    .int-modal {
        border-radius: var(--radius-lg);
    }

    .int-card-top,
    .int-card-form,
    .int-oauth-block,
    .int-signal-panel {
        padding-left: 18px;
        padding-right: 18px;
    }

    .int-actions > * {
        flex: 1 1 100%;
        justify-content: center;
    }

    .int-modal-head {
        gap: 12px;
    }

    .int-modal-head h3 {
        font-size: 20px;
    }
}
</style>
