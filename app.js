document.addEventListener('DOMContentLoaded', () => {
    // Login gate. Employee codes are checked by the server; passwords are never stored locally.
    const LOGIN_SESSION_KEY = 'tms_login_session_v1';
    const formLogin = document.getElementById('form-login');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const loginError = document.getElementById('login-error');
    const loginSubmitButton = formLogin ? formLogin.querySelector('.login-submit') : null;
    const btnResetLoginPassword = document.getElementById('btn-reset-login-password');
    const companyGate = document.getElementById('company-gate');
    const companyGateUser = document.getElementById('company-gate-user');
    const companyGateList = document.getElementById('company-gate-list');
    const btnCompanyGateLogout = document.getElementById('btn-company-gate-logout');
    const sidebarCompanyBadge = document.getElementById('sidebar-company-badge');
    const sidebarCompanyLogo = document.getElementById('sidebar-company-logo');
    const sidebarCompanyName = document.getElementById('sidebar-company-name');
    const currentUserName = document.getElementById('current-user-name');
    const btnLogout = document.getElementById('btn-logout');
    const btnToggleLoginPassword = document.getElementById('btn-toggle-login-password');
    const defaultLoginButtonHtml = loginSubmitButton ? loginSubmitButton.innerHTML : '';
    const isStaticHostedApp = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    const supabaseClient = window.supabase && window.TMS_SUPABASE_URL && window.TMS_SUPABASE_ANON_KEY
        ? window.supabase.createClient(window.TMS_SUPABASE_URL, window.TMS_SUPABASE_ANON_KEY)
        : null;
    const MENU_PERMISSION_KEY = 'tms_menu_permissions_v1';
    const APPROVAL_MENU_CONFIG = [
        { id: 'manager-approval', label: 'อนุมัติโดยหัวหน้า', icon: 'fa-user-tie' },
        { id: 'hr-approval', label: 'ตรวจสอบโดย HR', icon: 'fa-users-gear' },
        { id: 'md-approval', label: 'อนุมัติโดย MD', icon: 'fa-user-check' },
        { id: 'accounting-approval', label: 'พนักงานบัญชีทำจ่าย', icon: 'fa-file-invoice-dollar' }
    ];
    const APPROVAL_MENU_IDS = APPROVAL_MENU_CONFIG.map((item) => item.id);
    const PERMISSION_ROLE_KEY = 'tms_permission_roles_v1';
    const EMPLOYEE_ROLE_PERMISSION_KEY = 'tms_employee_role_permissions_v1';
    const PERMISSION_MENU_CONFIG = [
        { id: 'dashboard', label: 'แดชบอร์ด', icon: 'fa-chart-line' },
        { id: 'travel-plan', label: 'วางแผนการเดินทาง', icon: 'fa-map-location-dot' },
        { id: 'manager-approval', label: 'อนุมัติโดยหัวหน้า', icon: 'fa-user-tie' },
        { id: 'hr-approval', label: 'ตรวจสอบโดย HR', icon: 'fa-users-gear' },
        { id: 'md-approval', label: 'อนุมัติโดย MD', icon: 'fa-user-check' },
        { id: 'accounting-approval', label: 'บัญชีทำจ่าย', icon: 'fa-file-invoice-dollar' },
        { id: 'travel-status', label: 'สถานะเอกสารเดินทาง', icon: 'fa-clipboard-check' },
        { id: 'car-booking', label: 'สร้างเอกสารจองรถ', icon: 'fa-file-circle-plus' },
        { id: 'car-arrangement', label: 'จัดการคิวรถ', icon: 'fa-truck-ramp-box' },
        { id: 'packing-queue', label: 'จัดของ', icon: 'fa-box-open' },
        { id: 'car-document-approval', label: 'อนุมัติเอกสารจัดรถ', icon: 'fa-file-signature' },
        { id: 'car-document-status', label: 'สถานะเอกสารจัดรถ', icon: 'fa-chart-simple' },
        { id: 'admin-settings', label: 'ข้อมูลรถ', icon: 'fa-truck' },
        { id: 'maintenance', label: 'ตารางซ่อมบำรุง', icon: 'fa-wrench' },
        { id: 'fuel', label: 'จัดการค่าน้ำมัน', icon: 'fa-gas-pump' },
        { id: 'company-settings', label: 'ข้อมูลบริษัท', icon: 'fa-building' },
        { id: 'permission-management', label: 'จัดการสิทธิ์', icon: 'fa-shield-halved' },
        { id: 'ai-assistant', label: 'ผู้ช่วย AI', icon: 'fa-robot' }
    ];
    const PERMISSION_MENU_IDS = PERMISSION_MENU_CONFIG.map((item) => item.id);

    function getLoginSession() {
        try {
            const rawSession = localStorage.getItem(LOGIN_SESSION_KEY);
            const parsedSession = rawSession ? JSON.parse(rawSession) : null;
            return parsedSession && parsedSession.username && parsedSession.auth === 'employee-code'
                ? parsedSession
                : null;
        } catch (error) {
            localStorage.removeItem(LOGIN_SESSION_KEY);
            return null;
        }
    }

    function saveLoginSession(session) {
        localStorage.setItem(LOGIN_SESSION_KEY, JSON.stringify(session));
    }

    function updateLoginSession(updates) {
        const session = getLoginSession();
        if (!session) return null;
        const nextSession = { ...session, ...updates };
        saveLoginSession(nextSession);
        return nextSession;
    }

    function clearLoginSession() {
        localStorage.removeItem(LOGIN_SESSION_KEY);
        if (supabaseClient) {
            supabaseClient.auth.signOut().catch((error) => console.warn('Supabase sign out skipped:', error.message));
        }
        if (loginPasswordInput) loginPasswordInput.value = '';
        applyAuthState();
    }

    function canUseStaticLoginFallback(username, password) {
        return isStaticHostedApp && username && password && username === password;
    }

    function saveStaticLoginSession(username) {
        saveLoginSession({
            auth: 'employee-code',
            username,
            displayName: username,
            company: null,
            branch: null,
            department: null,
            loginMode: 'static-github-pages',
            loginAt: new Date().toISOString()
        });
    }

    function getSupabaseEmail(username) {
        const value = String(username || '').trim();
        return value.includes('@') ? value : `${value}@tms.local`;
    }

    async function trySupabaseLogin(username, password) {
        if (!supabaseClient) return null;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: getSupabaseEmail(username),
            password
        });
        if (error) throw error;

        const authUser = data?.user;
        let profile = null;
        if (authUser) {
            const profileResult = await supabaseClient
                .from('employee_profiles')
                .select('employee_code, full_name, branch, department, position, role_name')
                .eq('employee_code', username)
                .maybeSingle();
            if (!profileResult.error) profile = profileResult.data;
        }

        return {
            auth: 'employee-code',
            username: profile?.employee_code || username,
            displayName: profile?.full_name || profile?.employee_code || username,
            company: null,
            branch: profile?.branch || null,
            department: profile?.department || null,
            position: profile?.position || null,
            roleName: profile?.role_name || null,
            loginMode: 'supabase-auth',
            loginAt: new Date().toISOString()
        };
    }

    function markCompanySelected(company) {
        if (!company) return;
        updateLoginSession({
            selectedCompanyId: company.id,
            selectedCompanyCode: company.code,
            selectedCompanyName: company.nameEn || company.nameTh || company.code
        });
    }

    function renderCompanyGateOptions() {
        if (!companyGateList || typeof loadCompanies !== 'function') return;

        const companies = loadCompanies();
        if (!companies.length) {
            companyGateList.innerHTML = '<div class="glass-panel-inner text-secondary">ยังไม่มีข้อมูลบริษัท</div>';
            return;
        }

        companyGateList.innerHTML = companies.map((company) => `
            <button type="button" class="company-select-card" data-company-id="${escapeHtml(company.id)}">
                <span class="company-select-icon">${renderCompanyLogo(company, 'company-gate-logo-img')}</span>
                <strong>${escapeHtml(company.nameEn || company.nameTh || company.code)}</strong>
                <span>${escapeHtml(company.nameTh || company.address || '-')}</span>
            </button>
        `).join('');
    }

    function applyAuthState() {
        const session = getLoginSession();
        const isLoggedIn = Boolean(session);
        let hasSelectedCompany = Boolean(session?.selectedCompanyId);

        if (isLoggedIn && hasSelectedCompany && typeof loadCompanies === 'function') {
            hasSelectedCompany = loadCompanies().some((company) => company.id === session.selectedCompanyId);
        }

        document.body.classList.toggle('auth-unlocked', isLoggedIn && hasSelectedCompany);
        document.body.classList.toggle('auth-company-pending', isLoggedIn && !hasSelectedCompany);
        document.body.classList.toggle('auth-locked', !isLoggedIn);

        if (currentUserName) {
            currentUserName.textContent = isLoggedIn ? (session.displayName || session.username) : 'ผู้ใช้งาน';
        }

        if (companyGateUser) {
            companyGateUser.textContent = isLoggedIn ? (session.displayName || session.username) : 'ผู้ใช้งาน';
        }

        if (isLoggedIn && !hasSelectedCompany) {
            renderCompanyGateOptions();
        }

        if (!isLoggedIn && loginUsernameInput) {
            setTimeout(() => loginUsernameInput.focus(), 80);
        }

        if (typeof applyMenuPermissions === 'function') {
            applyMenuPermissions();
        }
    }

    if (formLogin) {
        formLogin.addEventListener('submit', async (event) => {
            event.preventDefault();

            const username = (loginUsernameInput?.value || '').trim();
            const password = (loginPasswordInput?.value || '').trim();

            if (!username || !password) {
                if (loginError) {
                    loginError.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
                    loginError.classList.remove('is-success');
                }
                return;
            }

            if (!window.TransportApi || typeof window.TransportApi.login !== 'function') {
                if (canUseStaticLoginFallback(username, password)) {
                    saveStaticLoginSession(username);
                    if (loginError) {
                        loginError.textContent = '';
                        loginError.classList.remove('is-success');
                    }
                    if (loginPasswordInput) loginPasswordInput.value = '';
                    applyAuthState();
                    return;
                }
                if (loginError) {
                    loginError.textContent = 'ยังเชื่อมต่อระบบล็อกอินไม่ได้';
                    loginError.classList.remove('is-success');
                }
                return;
            }

            if (canUseStaticLoginFallback(username, password)) {
                saveStaticLoginSession(username);
                if (loginError) {
                    loginError.textContent = '';
                    loginError.classList.remove('is-success');
                }
                if (loginPasswordInput) loginPasswordInput.value = '';
                applyAuthState();
                return;
            }

            if (isStaticHostedApp && supabaseClient) {
                if (loginSubmitButton) {
                    loginSubmitButton.disabled = true;
                    loginSubmitButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังตรวจสอบ';
                }
                try {
                    const session = await trySupabaseLogin(username, password);
                    if (session) {
                        saveLoginSession(session);
                        if (loginError) {
                            loginError.textContent = '';
                            loginError.classList.remove('is-success');
                        }
                        if (loginPasswordInput) loginPasswordInput.value = '';
                        applyAuthState();
                        return;
                    }
                } catch (error) {
                    if (!canUseStaticLoginFallback(username, password)) {
                        if (loginError) {
                            loginError.textContent = error.message || 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง';
                            loginError.classList.remove('is-success');
                        }
                        return;
                    }
                } finally {
                    if (loginSubmitButton) {
                        loginSubmitButton.disabled = false;
                        loginSubmitButton.innerHTML = defaultLoginButtonHtml;
                    }
                }
            }

            if (loginSubmitButton) {
                loginSubmitButton.disabled = true;
                loginSubmitButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังตรวจสอบ';
            }

            try {
                const payload = await window.TransportApi.login({ username, password });
                const user = payload.user || {};

                saveLoginSession({
                    auth: 'employee-code',
                    username: user.employeeCode || username,
                    displayName: user.name || user.employeeCode || username,
                    company: user.company || null,
                    branch: user.branch || null,
                    department: user.department || null,
                    loginAt: payload.loginAt || new Date().toISOString()
                });

                if (loginError) {
                    loginError.textContent = '';
                    loginError.classList.remove('is-success');
                }
                if (loginPasswordInput) loginPasswordInput.value = '';
                applyAuthState();
            } catch (error) {
                if (canUseStaticLoginFallback(username, password)) {
                    saveStaticLoginSession(username);
                    if (loginError) {
                        loginError.textContent = '';
                        loginError.classList.remove('is-success');
                    }
                    if (loginPasswordInput) loginPasswordInput.value = '';
                    applyAuthState();
                    return;
                }
                if (loginError) {
                    loginError.textContent = isStaticHostedApp
                        ? 'เว็บบน GitHub ไม่มี API ระบบจึงใช้ได้เฉพาะรหัสผ่านที่ตรงกับรหัสพนักงาน'
                        : (error.message || 'รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง');
                    loginError.classList.remove('is-success');
                }
            } finally {
                if (loginSubmitButton) {
                    loginSubmitButton.disabled = false;
                    loginSubmitButton.innerHTML = defaultLoginButtonHtml;
                }
            }
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', clearLoginSession);
    }

    if (btnCompanyGateLogout) {
        btnCompanyGateLogout.addEventListener('click', clearLoginSession);
    }

    if (companyGateList) {
        companyGateList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-company-id]');
            if (!button || typeof loadCompanies !== 'function') return;

            const companies = loadCompanies();
            const company = companies.find((item) => item.id === button.dataset.companyId);
            if (!company) return;

            if (typeof setActiveCompany === 'function') {
                setActiveCompany(company.id);
            } else {
                localStorage.setItem('tms_active_company_id', company.id);
                markCompanySelected(company);
            }

            applyAuthState();
        });
    }

    if (btnToggleLoginPassword && loginPasswordInput) {
        btnToggleLoginPassword.addEventListener('click', () => {
            const shouldShow = loginPasswordInput.type === 'password';
            loginPasswordInput.type = shouldShow ? 'text' : 'password';
            btnToggleLoginPassword.innerHTML = `<i class="fa-solid ${shouldShow ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        });
    }

    if (btnResetLoginPassword) {
        btnResetLoginPassword.addEventListener('click', async () => {
            const username = (loginUsernameInput?.value || '').trim();
            if (!username) {
                if (loginError) loginError.textContent = 'กรุณากรอกรหัสพนักงานก่อนรีเซ็ตรหัสผ่าน';
                if (loginUsernameInput) loginUsernameInput.focus();
                return;
            }

            if (!window.TransportApi || typeof window.TransportApi.resetPassword !== 'function') {
                if (isStaticHostedApp) {
                    if (loginPasswordInput) {
                        loginPasswordInput.value = username;
                        loginPasswordInput.focus();
                    }
                    if (loginError) {
                        loginError.textContent = 'เว็บบน GitHub ตั้งรหัสผ่านเป็นรหัสพนักงานให้แล้ว';
                        loginError.classList.add('is-success');
                    }
                    return;
                }
                if (loginError) loginError.textContent = 'ยังเชื่อมต่อระบบรีเซ็ตรหัสผ่านไม่ได้';
                return;
            }

            const defaultHtml = btnResetLoginPassword.innerHTML;
            btnResetLoginPassword.disabled = true;
            btnResetLoginPassword.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังรีเซ็ต';

            try {
                if (isStaticHostedApp) {
                    if (loginPasswordInput) {
                        loginPasswordInput.value = username;
                        loginPasswordInput.focus();
                    }
                    if (loginError) {
                        loginError.textContent = 'เว็บบน GitHub ตั้งรหัสผ่านเป็นรหัสพนักงานให้แล้ว';
                        loginError.classList.add('is-success');
                    }
                    return;
                }
                await window.TransportApi.resetPassword({ username });
                if (loginPasswordInput) {
                    loginPasswordInput.value = username;
                    loginPasswordInput.focus();
                }
                if (loginError) {
                    loginError.textContent = 'รีเซ็ตรหัสผ่านแล้ว ระบบตั้งรหัสผ่านเป็นรหัสพนักงาน';
                    loginError.classList.add('is-success');
                }
            } catch (error) {
                if (loginError) {
                    loginError.textContent = error.message || 'รีเซ็ตรหัสผ่านไม่สำเร็จ';
                    loginError.classList.remove('is-success');
                }
            } finally {
                btnResetLoginPassword.disabled = false;
                btnResetLoginPassword.innerHTML = defaultHtml;
            }
        });
    }

    // 1. Navigation Logic
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    const titles = {
        'dashboard': { text: 'แดชบอร์ดภาพรวม (Dashboard)', icon: 'fa-chart-line' },
        'travel-plan': { text: 'วางแผนการเดินทาง (Shipment Planning)', icon: 'fa-map-location-dot' },
        'travel-status': { text: 'ตรวจสอบสถานะเอกสาร (Document Status)', icon: 'fa-clipboard-check' },
        'manager-approval': { text: 'อนุมัติโดยหัวหน้า (Mgr Approval)', icon: 'fa-user-tie' },
        'hr-approval': { text: 'ตรวจสอบโดย HR (HR Check)', icon: 'fa-users-gear' },
        'md-approval': { text: 'อนุมัติโดย MD (MD Approval)', icon: 'fa-user-tie' },
        'accounting-approval': { text: 'พนักงานบัญชีทำจ่าย (Accounting)', icon: 'fa-file-invoice-dollar' },
        'car-booking': { text: 'สร้างเอกสาร', icon: 'fa-file-circle-plus' },
        'car-arrangement': { text: 'จัดการคิวรถ', icon: 'fa-truck-ramp-box' },
        'packing': { text: 'จัดของ', icon: 'fa-box-open' },
        'packing-queue': { text: 'จัดของ', icon: 'fa-box-open' },
        'admin-settings': { text: 'ข้อมูลรถ (Vehicle Registry)', icon: 'fa-truck' },
        'route-optimization': { text: 'จัดการเส้นทางเดินรถ (Route Optimization)', icon: 'fa-route' },
        'delivery-scheduling': { text: 'ตารางเวลาส่งมอบ (Delivery Scheduling)', icon: 'fa-clock' },
        'car-document-approval': { text: 'อนุมัติเอกสาร', icon: 'fa-file-signature' },
        'car-document-status': { text: 'สถานะเอกสาร', icon: 'fa-chart-simple' },
        'import-orders': { text: 'นำเข้าออเดอร์ (Import Orders)', icon: 'fa-file-import' },
        'fleet-management': { text: 'ตั้งค่าระบบ (System Settings)', icon: 'fa-gear' },
        'maintenance-schedule': { text: 'ตารางซ่อมบำรุง (Maintenance Schedule)', icon: 'fa-calendar-alt' },
        'fuel-log': { text: 'บันทึกค่าน้ำมัน (Fuel Log)', icon: 'fa-gas-pump' },
        'shipment-tracking': { text: 'ติดตามสถานะ (Shipment Tracking)', icon: 'fa-satellite-dish' },
        'exceptions-handling': { text: 'จัดการปัญหา (Exceptions Handling)', icon: 'fa-triangle-exclamation' },
        'maintenance': { text: 'ตารางซ่อมบำรุง (Maintenance)', icon: 'fa-wrench' },
        'fuel': { text: 'จัดการค่าน้ำมัน (Fuel Management)', icon: 'fa-gas-pump' },
        'company-settings': { text: 'ข้อมูลบริษัท (Company)', icon: 'fa-building' },
        'permission-management': { text: 'จัดการสิทธิ์ (Permissions)', icon: 'fa-shield-halved' },
        'ai-assistant': { text: 'ผู้ช่วย AI (GPT)', icon: 'fa-robot' }
    };

    function normalizeEmployeeCode(value) {
        return String(value || '').trim();
    }

    function loadMenuPermissions() {
        try {
            const parsed = JSON.parse(localStorage.getItem(MENU_PERMISSION_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            localStorage.removeItem(MENU_PERMISSION_KEY);
            return {};
        }
    }

    function saveMenuPermissions(permissions) {
        localStorage.setItem(MENU_PERMISSION_KEY, JSON.stringify(permissions || {}));
    }

    function getDefaultPermissionRoles() {
        return [
            {
                id: 'role-admin',
                name: 'ผู้ดูแลระบบ',
                menus: [...PERMISSION_MENU_IDS],
                updatedAt: new Date().toISOString()
            },
            {
                id: 'role-approver',
                name: 'ผู้อนุมัติเอกสาร',
                menus: ['dashboard', 'travel-plan', 'travel-status', ...APPROVAL_MENU_IDS],
                updatedAt: new Date().toISOString()
            },
            {
                id: 'role-transport',
                name: 'พนักงานขนส่ง',
                menus: ['dashboard', 'travel-plan', 'travel-status', 'car-booking', 'car-arrangement', 'packing-queue', 'car-document-status'],
                updatedAt: new Date().toISOString()
            }
        ];
    }

    function loadPermissionRoles() {
        try {
            const parsed = JSON.parse(localStorage.getItem(PERMISSION_ROLE_KEY) || '[]');
            if (Array.isArray(parsed) && parsed.length) {
                return parsed.map((role) => ({
                    id: String(role.id || '').trim(),
                    name: String(role.name || '').trim(),
                    menus: Array.isArray(role.menus) ? role.menus.filter((menuId) => PERMISSION_MENU_IDS.includes(menuId)) : [],
                    updatedAt: role.updatedAt || null
                })).filter((role) => role.id && role.name);
            }
        } catch (error) {
            localStorage.removeItem(PERMISSION_ROLE_KEY);
        }
        const defaults = getDefaultPermissionRoles();
        savePermissionRoles(defaults);
        return defaults;
    }

    function savePermissionRoles(roles) {
        localStorage.setItem(PERMISSION_ROLE_KEY, JSON.stringify(Array.isArray(roles) ? roles : []));
    }

    function loadEmployeeRolePermissions() {
        try {
            const parsed = JSON.parse(localStorage.getItem(EMPLOYEE_ROLE_PERMISSION_KEY) || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (error) {
            localStorage.removeItem(EMPLOYEE_ROLE_PERMISSION_KEY);
            return {};
        }
    }

    function saveEmployeeRolePermissions(assignments) {
        localStorage.setItem(EMPLOYEE_ROLE_PERMISSION_KEY, JSON.stringify(assignments || {}));
    }

    function permissionRowsToMap(rows) {
        return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
            const employeeId = normalizeEmployeeCode(row.employeeId || row.employee_id);
            if (!employeeId) return acc;
            acc[employeeId] = {
                employeeId,
                name: row.name || row.employeeName || row.employee_name || employeeId,
                menus: Array.isArray(row.menus) ? row.menus.filter((menuId) => APPROVAL_MENU_IDS.includes(menuId)) : [],
                updatedAt: row.updatedAt || row.updated_at || null
            };
            return acc;
        }, {});
    }

    async function syncMenuPermissionsFromServer() {
        if (!window.TransportApi || typeof window.TransportApi.listMenuPermissions !== 'function') {
            renderMenuPermissionList();
            applyMenuPermissions();
            return;
        }

        try {
            const rows = await window.TransportApi.listMenuPermissions();
            saveMenuPermissions(permissionRowsToMap(rows));
        } catch (error) {
            console.warn('Menu permissions sync skipped:', error.message);
        } finally {
            renderMenuPermissionList();
            applyMenuPermissions();
        }
    }

    function getApprovalMenuLabel(menuId) {
        return APPROVAL_MENU_CONFIG.find((item) => item.id === menuId)?.label || menuId;
    }

    function getCurrentEmployeeCode() {
        return normalizeEmployeeCode(getLoginSession()?.username);
    }

    function seedCurrentUserMenuPermissions() {
        return loadMenuPermissions();
    }

    function getCurrentMenuPermission() {
        const employeeId = getCurrentEmployeeCode();
        if (!employeeId) return null;
        const permissions = seedCurrentUserMenuPermissions();
        return permissions[employeeId] || null;
    }

    function getCurrentRolePermission() {
        const employeeId = getCurrentEmployeeCode();
        if (!employeeId) return null;
        const assignments = loadEmployeeRolePermissions();
        const assignment = assignments[employeeId];
        if (!assignment || !Array.isArray(assignment.menus)) return null;
        return {
            ...assignment,
            menus: assignment.menus.filter((menuId) => PERMISSION_MENU_IDS.includes(menuId))
        };
    }

    function canSeeApprovalMenu(menuId) {
        if (!APPROVAL_MENU_IDS.includes(menuId)) return true;
        const permission = getCurrentMenuPermission();
        return Array.isArray(permission?.menus) && permission.menus.includes(menuId);
    }

    function canSeeManagedMenu(menuId) {
        if (menuId === 'dashboard') return true;
        const rolePermission = getCurrentRolePermission();
        if (rolePermission && PERMISSION_MENU_IDS.includes(menuId)) {
            return rolePermission.menus.includes(menuId);
        }
        return canSeeApprovalMenu(menuId);
    }

    function activateSection(targetId, preferredButton = null) {
        const targetButton = preferredButton || document.querySelector(`.nav-btn[data-target="${targetId}"]`);
        if (!targetId || (targetButton && targetButton.hidden)) return false;

        navButtons.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        if (targetButton) targetButton.classList.add('active');
        const targetEl = document.getElementById(targetId);

        if (targetEl) {
            targetEl.classList.add('active');
        } else {
            console.warn('Target section not found for id:', targetId);
        }

        if (titles[targetId]) {
            pageTitle.innerHTML = `<i class="fa-solid ${titles[targetId].icon}"></i> ${titles[targetId].text}`;
        }

        if(targetId === 'dashboard' && typeof dashboardMap !== 'undefined' && dashboardMap) {
            setTimeout(() => {
                dashboardMap.invalidateSize();
            }, 50);
        }

        if(targetId === 'route-optimization' && window.optMap) {
            setTimeout(() => {
                window.optMap.invalidateSize();
            }, 50);
        }

        if (targetId === 'travel-status' && typeof loadTravelStatusRequests === 'function') {
            loadTravelStatusRequests({ preserveDetail: true });
        }

        return true;
    }

    function applyMenuPermissions() {
        const isLoggedIn = Boolean(getLoginSession());
        let activeSectionId = document.querySelector('.view-section.active')?.id || '';

        navButtons.forEach((button) => {
            const targetId = button.getAttribute('data-target');
            const isManagedMenu = PERMISSION_MENU_IDS.includes(targetId) || APPROVAL_MENU_IDS.includes(targetId);
            const shouldHide = isLoggedIn && isManagedMenu && !canSeeManagedMenu(targetId);
            button.hidden = shouldHide;
            button.classList.toggle('permission-hidden', shouldHide);
            if (shouldHide && button.classList.contains('active')) {
                button.classList.remove('active');
            }
        });

        if (activeSectionId && PERMISSION_MENU_IDS.includes(activeSectionId) && !canSeeManagedMenu(activeSectionId)) {
            const fallbackButton = Array.from(navButtons).find((button) => !button.hidden && button.getAttribute('data-target') === 'travel-plan')
                || Array.from(navButtons).find((button) => !button.hidden && button.getAttribute('data-target') === 'dashboard')
                || Array.from(navButtons).find((button) => !button.hidden);
            if (fallbackButton) {
                activateSection(fallbackButton.getAttribute('data-target'), fallbackButton);
            }
        }

        renderMenuPermissionList();
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log('Menu clicked:', btn.getAttribute('data-target'), e.target);
            try {
                const targetId = btn.getAttribute('data-target');
                if (btn.hidden || (APPROVAL_MENU_IDS.includes(targetId) && !canSeeApprovalMenu(targetId))) return;
                activateSection(targetId, btn);
            } catch (err) {
                console.error('Error in menu click handler:', err);
            }
        });
    });

    // -- Sidebar Accordion Logic --
    const moduleTitles = document.querySelectorAll('.nav-module-title');
    moduleTitles.forEach(title => {
        title.addEventListener('click', () => {
            const parentModule = title.closest('.nav-module');
            if (parentModule) {
                parentModule.classList.toggle('collapsed');
            }
        });
    });

    const aiChatForm = document.getElementById('ai-chat-form');
    const aiMessageInput = document.getElementById('ai-message-input');
    const aiChatLog = document.getElementById('ai-chat-log');
    const aiSendButton = document.getElementById('btn-ai-send');
    const aiStatusPill = document.getElementById('ai-status-pill');
    const aiProviderSelect = document.getElementById('ai-provider-select');
    const aiAttachmentInput = document.getElementById('ai-attachment-input');
    const aiAttachmentList = document.getElementById('ai-attachment-list');
    const aiHistoryList = document.getElementById('ai-history-list');
    const btnAiAttach = document.getElementById('btn-ai-attach');
    const btnAiVoice = document.getElementById('btn-ai-voice');
    const btnAiExport = document.getElementById('btn-ai-export');
    const btnAiClear = document.getElementById('btn-ai-clear');
    const btnAiNewChat = document.getElementById('btn-ai-new-chat');
    const AI_TMS_HISTORY_KEY = 'tms_ai_gpt_conversations_v1';
    let aiConversations = loadAiConversations();
    let activeAiConversationId = aiConversations[0]?.id || createAiConversation().id;
    let aiPendingAttachments = [];

    function loadAiConversations() {
        try {
            const parsed = JSON.parse(localStorage.getItem(AI_TMS_HISTORY_KEY) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function saveAiConversations() {
        localStorage.setItem(AI_TMS_HISTORY_KEY, JSON.stringify(aiConversations.slice(0, 30)));
    }

    function createAiConversation() {
        const conversation = {
            id: `ai_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            title: 'แชทใหม่',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        aiConversations.unshift(conversation);
        saveAiConversations();
        return conversation;
    }

    function getActiveAiConversation() {
        let conversation = aiConversations.find((item) => item.id === activeAiConversationId);
        if (!conversation) {
            conversation = createAiConversation();
            activeAiConversationId = conversation.id;
        }
        return conversation;
    }

    function makeAiTitle(text = '') {
        const compact = text.replace(/\s+/g, ' ').trim();
        return compact ? compact.slice(0, 38) : 'แชทใหม่';
    }

    function renderAiHistory() {
        if (!aiHistoryList) return;
        aiHistoryList.innerHTML = aiConversations.length
            ? aiConversations.map((conversation) => `
                <button type="button" class="ai-history-item ${conversation.id === activeAiConversationId ? 'active' : ''}" data-ai-history-id="${escapeHtml(conversation.id)}">
                    <i class="fa-solid fa-message"></i>
                    <span>${escapeHtml(conversation.title || 'แชทใหม่')}</span>
                </button>
            `).join('')
            : '<div class="text-secondary text-sm">ยังไม่มีประวัติแชท</div>';
    }

    function renderAiMessages() {
        if (!aiChatLog) return;
        const conversation = getActiveAiConversation();
        if (!conversation.messages.length) {
            aiChatLog.innerHTML = `
                <div class="ai-message ai-message-assistant">
                    <div class="ai-message-avatar"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                    <div class="ai-message-bubble">สวัสดีครับ ผมใช้ระบบจาก AI-GPT-App แล้ว อยู่ในหน้าเดียวกับ TMS พร้อมช่วยงานขนส่งได้เลย</div>
                </div>
            `;
        } else {
            aiChatLog.innerHTML = conversation.messages.map((message) => renderAiMessageHtml(message)).join('');
        }
        aiChatLog.scrollTop = aiChatLog.scrollHeight;
        renderAiHistory();
    }

    function renderAiMessageHtml(message) {
        const imageHtml = message.image?.url
            ? `<div class="ai-image-result"><img src="${escapeHtml(message.image.url)}" alt="${escapeHtml(message.image.fileName || 'ai-image.png')}"><a href="${escapeHtml(message.image.url)}" target="_blank" rel="noreferrer">เปิดรูป</a></div>`
            : '';
        return `
            <div class="ai-message ai-message-${escapeHtml(message.role)}">
                <div class="ai-message-avatar"><i class="fa-solid ${message.role === 'user' ? 'fa-user' : 'fa-robot'}"></i></div>
                <div class="ai-message-bubble">${escapeHtml(message.content || '').replace(/\n/g, '<br>')}${imageHtml}</div>
            </div>
        `;
    }

    function pushAiMessage(message) {
        const conversation = getActiveAiConversation();
        conversation.messages.push(message);
        conversation.updatedAt = new Date().toISOString();
        if (conversation.title === 'แชทใหม่' && message.role === 'user') {
            conversation.title = makeAiTitle(message.content);
        }
        aiConversations = [conversation, ...aiConversations.filter((item) => item.id !== conversation.id)];
        activeAiConversationId = conversation.id;
        saveAiConversations();
        renderAiMessages();
    }

    function updateLastAiAssistantMessage(updates) {
        const conversation = getActiveAiConversation();
        for (let index = conversation.messages.length - 1; index >= 0; index--) {
            if (conversation.messages[index].role === 'assistant') {
                conversation.messages[index] = { ...conversation.messages[index], ...updates };
                break;
            }
        }
        saveAiConversations();
        renderAiMessages();
    }

    function renderAiAttachments() {
        if (!aiAttachmentList) return;
        aiAttachmentList.hidden = aiPendingAttachments.length === 0;
        aiAttachmentList.innerHTML = aiPendingAttachments.map((attachment, index) => `
            <span class="ai-attachment-pill">
                <i class="fa-solid ${attachment.type.startsWith('image/') ? 'fa-file-image' : 'fa-file'}"></i>
                ${escapeHtml(attachment.name)}
                <button type="button" data-ai-remove-attachment="${index}" title="ลบไฟล์"><i class="fa-solid fa-xmark"></i></button>
            </span>
        `).join('');
    }

    function fileToAiAttachment(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                resolve({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    data: result.includes(',') ? result.split(',')[1] : result,
                });
            };
            reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
            reader.readAsDataURL(file);
        });
    }

    function hasImageAttachment() {
        return aiPendingAttachments.some((attachment) => ['image/png', 'image/jpeg', 'image/webp'].includes(attachment.type));
    }

    function shouldCreateImage(message = '') {
        const text = message.toLowerCase();
        return text.includes('สร้างรูป') || text.includes('วาดรูป') || text.includes('generate image') || text.includes('create image');
    }

    function shouldEditImage(message = '') {
        const text = message.toLowerCase();
        return hasImageAttachment() && (text.includes('แก้รูป') || text.includes('ลบพื้นหลัง') || text.includes('ปรับรูป') || text.includes('edit image'));
    }

    function compactText(value = '', maxLength = 1200) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength);
    }

    function safeJson(value, maxLength = 4000) {
        try {
            return JSON.stringify(value, null, 2).slice(0, maxLength);
        } catch (error) {
            return String(value).slice(0, maxLength);
        }
    }

    function getFieldSnapshot(scope = document) {
        return Array.from(scope.querySelectorAll('input, select, textarea'))
            .filter((field) => {
                const type = (field.getAttribute('type') || '').toLowerCase();
                return type !== 'password' && type !== 'hidden' && !field.closest('.login-screen');
            })
            .slice(0, 180)
            .map((field) => {
                const label = field.closest('.input-group')?.querySelector('label')?.innerText
                    || field.getAttribute('aria-label')
                    || field.getAttribute('placeholder')
                    || field.id
                    || field.name
                    || field.tagName.toLowerCase();
                const value = field.type === 'checkbox' || field.type === 'radio'
                    ? (field.checked ? 'checked' : 'unchecked')
                    : field.value;
                return `${compactText(label, 80)}: ${compactText(value || '-', 220)}`;
            });
    }

    function getTableSnapshot() {
        return Array.from(document.querySelectorAll('.view-section table'))
            .slice(0, 24)
            .map((table, tableIndex) => {
                const section = table.closest('.view-section');
                const sectionTitle = section?.id || `table-${tableIndex + 1}`;
                const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => compactText(cell.innerText, 60));
                const rows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 12).map((row) => {
                    const cells = Array.from(row.children).map((cell) => compactText(cell.innerText, 120));
                    return cells.join(' | ');
                });
                return {
                    section: sectionTitle,
                    headers,
                    rows,
                    totalRowsVisible: table.querySelectorAll('tbody tr').length,
                };
            });
    }

    function getVisibleSectionSnapshot() {
        const activeSection = document.querySelector('.view-section.active');
        if (!activeSection) return null;
        return {
            id: activeSection.id || '',
            title: compactText(document.getElementById('page-title')?.innerText || activeSection.querySelector('h3,h2,h1')?.innerText || '', 180),
            visibleText: compactText(activeSection.innerText, 3500),
            fields: getFieldSnapshot(activeSection),
        };
    }

    function getLocalStorageSnapshot() {
        const allowedKeys = [
            'tms_login_session_v1',
            'tms_active_company_id',
            'tms_companies_v1',
            'tms_menu_permissions_v1',
            'tms_permission_roles_v1',
            'tms_employee_role_permissions_v1',
            'tms_ai_gpt_conversations_v1',
        ];
        return allowedKeys.reduce((acc, key) => {
            const raw = localStorage.getItem(key);
            if (!raw) return acc;
            acc[key] = raw.length > 2500 ? `${raw.slice(0, 2500)}...` : raw;
            return acc;
        }, {});
    }

    async function fetchTmsContextApiData() {
        if (!window.TransportApi) return {};
        const tasks = {
            cars: () => window.TransportApi.listCars(),
            travelRequests: () => window.TransportApi.listTravelRequests(),
            deliveryNotes: () => window.TransportApi.listDeliveryNotes(),
            gps: () => window.TransportApi.listGps(),
            fuelPrices: () => window.TransportApi.getPttFuelPrices(),
            users: () => window.TransportApi.listUsers(),
            menuPermissions: () => window.TransportApi.listMenuPermissions(),
        };
        const entries = await Promise.all(Object.entries(tasks).map(async ([key, loader]) => {
            try {
                const value = await Promise.race([
                    loader(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4500)),
                ]);
                const limitedValue = Array.isArray(value) ? value.slice(0, 40) : value;
                return [key, limitedValue];
            } catch (error) {
                return [key, { unavailable: true, reason: error.message }];
            }
        }));
        return Object.fromEntries(entries);
    }

    async function buildTmsAiContext(userMessage = '') {
        const session = getLoginSession();
        const apiData = await fetchTmsContextApiData();
        const context = {
            purpose: 'TMS Pro full application context snapshot. Use this as live system data when answering the user.',
            userQuestion: userMessage,
            generatedAt: new Date().toISOString(),
            pageTitle: document.getElementById('page-title')?.innerText || '',
            session: {
                username: session?.username || '',
                displayName: session?.displayName || '',
                selectedCompanyId: session?.selectedCompanyId || '',
                selectedCompanyCode: session?.selectedCompanyCode || '',
                selectedCompanyName: session?.selectedCompanyName || '',
                department: session?.department || '',
                branch: session?.branch || '',
            },
            activeSection: getVisibleSectionSnapshot(),
            allVisibleTables: getTableSnapshot(),
            formFieldsAcrossTms: getFieldSnapshot(document),
            localState: getLocalStorageSnapshot(),
            apiData,
            answerRules: [
                'ตอบเป็นภาษาไทยเป็นหลัก',
                'ถ้าข้อมูลใน context ไม่พอ ให้บอกว่าข้อมูลส่วนใดไม่พบในระบบ',
                'อ้างอิงเลขเอกสาร ทะเบียนรถ ชื่อบริษัท สถานะ และตัวเลขจาก context ให้ชัดเจน',
                'ห้ามเดาข้อมูลที่ไม่มีใน snapshot',
            ],
        };
        return safeJson(context, 24000);
    }

    function setAiStatus(configured, label) {
        if (!aiStatusPill) return;
        aiStatusPill.classList.toggle('is-ready', Boolean(configured));
        aiStatusPill.classList.toggle('is-missing', !configured);
        aiStatusPill.innerHTML = configured
            ? `<i class="fa-solid fa-circle-check"></i><span>${escapeHtml(label || 'พร้อมใช้งาน')}</span>`
            : `<i class="fa-solid fa-triangle-exclamation"></i><span>${escapeHtml(label || 'ยังไม่ได้ตั้งค่า token')}</span>`;
    }

    function appendAiMessage(role, text) {
        pushAiMessage({ role, content: text });
        return true;
    }

    async function refreshAiStatus() {
        if (!window.TransportApi || typeof window.TransportApi.getAiGptAppStatus !== 'function') {
            setAiStatus(false, 'ยังไม่พบ AI-GPT-App API');
            return;
        }

        try {
            const status = await window.TransportApi.getAiGptAppStatus();
            const providers = status.providers || {};
            const selectedProvider = aiProviderSelect?.value || status.defaultProvider || 'openai';
            const selectedStatus = providers[selectedProvider] || {};

            if (aiProviderSelect) {
                aiProviderSelect.value = selectedProvider;
                Array.from(aiProviderSelect.options).forEach((option) => {
                    const providerStatus = providers[option.value] || {};
                    option.textContent = providerStatus.model
                        ? `${option.value === 'gemini' ? 'Gemini' : 'OpenAI GPT'} (${providerStatus.model})`
                        : (option.value === 'gemini' ? 'Gemini' : 'OpenAI GPT');
                });
            }

            setAiStatus(
                selectedStatus.configured,
                selectedStatus.configured
                    ? `พร้อมใช้ ${selectedStatus.model || status.model || 'AI'}`
                    : `${selectedProvider === 'gemini' ? 'Gemini' : 'OpenAI'} ยังไม่ได้ตั้งค่า token`
            );
        } catch (error) {
            setAiStatus(false, error.message || 'ตรวจสอบ AI ไม่สำเร็จ');
        }
    }

    if (aiChatForm && aiMessageInput) {
        aiChatForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const message = aiMessageInput.value.trim();
            if (!message && !aiPendingAttachments.length) return;

            appendAiMessage('user', message);
            aiMessageInput.value = '';
            appendAiMessage('assistant', 'กำลังคิดคำตอบ...');
            const attachments = [...aiPendingAttachments];
            aiPendingAttachments = [];
            renderAiAttachments();

            if (aiSendButton) {
                aiSendButton.disabled = true;
                aiSendButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> กำลังส่ง';
            }

            try {
                const session = getLoginSession();
                const basicContext = [
                    session?.displayName ? `ผู้ใช้งาน: ${session.displayName}` : '',
                    session?.selectedCompanyName ? `บริษัท: ${session.selectedCompanyName}` : '',
                ].filter(Boolean).join('\n');
                const tmsContext = await buildTmsAiContext(message);
                const context = [basicContext, tmsContext].filter(Boolean).join('\n\n');
                let payload;

                if (shouldEditImage(message)) {
                    payload = await window.TransportApi.editAiGptAppImage({ prompt: message || 'ช่วยแก้ไขรูปนี้ให้เหมาะสม', attachments });
                    updateLastAiAssistantMessage({
                        content: `แก้รูปเรียบร้อยแล้ว (${payload.model || 'OpenAI Image'})`,
                        image: payload.image,
                    });
                } else if (shouldCreateImage(message)) {
                    payload = await window.TransportApi.createAiGptAppImage({ prompt: message });
                    updateLastAiAssistantMessage({
                        content: `สร้างรูปเรียบร้อยแล้ว (${payload.model || 'OpenAI Image'})`,
                        image: payload.image,
                    });
                } else {
                    payload = await window.TransportApi.sendAiGptAppMessage({
                        message,
                        attachments,
                        provider: aiProviderSelect?.value || 'openai',
                        context,
                    });
                    updateLastAiAssistantMessage({ content: payload.answer || '' });
                }
            } catch (error) {
                updateLastAiAssistantMessage({ content: error.message || 'ส่งคำถามไปยัง AI ไม่สำเร็จ' });
            } finally {
                if (aiSendButton) {
                    aiSendButton.disabled = false;
                    aiSendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ส่ง';
                }
            }
        });
    }

    if (btnAiAttach && aiAttachmentInput) {
        btnAiAttach.addEventListener('click', () => aiAttachmentInput.click());
        aiAttachmentInput.addEventListener('change', async () => {
            const files = Array.from(aiAttachmentInput.files || []);
            try {
                const attachments = await Promise.all(files.map(fileToAiAttachment));
                aiPendingAttachments.push(...attachments);
                renderAiAttachments();
            } catch (error) {
                alert(error.message || 'แนบไฟล์ไม่สำเร็จ');
            } finally {
                aiAttachmentInput.value = '';
            }
        });
    }

    if (aiAttachmentList) {
        aiAttachmentList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-ai-remove-attachment]');
            if (!button) return;
            aiPendingAttachments.splice(Number(button.dataset.aiRemoveAttachment), 1);
            renderAiAttachments();
        });
    }

    if (btnAiNewChat) {
        btnAiNewChat.addEventListener('click', () => {
            activeAiConversationId = createAiConversation().id;
            renderAiMessages();
        });
    }

    if (btnAiClear) {
        btnAiClear.addEventListener('click', () => {
            if (!confirm('ล้างประวัติ AI ทั้งหมดใช่ไหม?')) return;
            aiConversations = [];
            activeAiConversationId = createAiConversation().id;
            renderAiMessages();
        });
    }

    if (btnAiExport) {
        btnAiExport.addEventListener('click', () => {
            const conversation = getActiveAiConversation();
            const text = conversation.messages.map((message) => `${message.role.toUpperCase()}: ${message.content || ''}${message.image?.url ? `\nIMAGE: ${location.origin}${message.image.url}` : ''}`).join('\n\n');
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${conversation.title || 'ai-chat'}.txt`.replace(/[\\/:*?"<>|]+/g, '-');
            link.click();
            URL.revokeObjectURL(url);
        });
    }

    if (btnAiVoice) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            btnAiVoice.disabled = true;
            btnAiVoice.title = 'Browser นี้ไม่รองรับการพูดด้วยเสียง';
        } else {
            btnAiVoice.addEventListener('click', () => {
                const recognition = new SpeechRecognition();
                recognition.lang = 'th-TH';
                recognition.interimResults = false;
                recognition.onresult = (event) => {
                    const transcript = event.results?.[0]?.[0]?.transcript || '';
                    aiMessageInput.value = [aiMessageInput.value, transcript].filter(Boolean).join(' ');
                    aiMessageInput.focus();
                };
                recognition.start();
            });
        }
    }

    if (aiHistoryList) {
        aiHistoryList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-ai-history-id]');
            if (!button) return;
            activeAiConversationId = button.dataset.aiHistoryId;
            renderAiMessages();
        });
    }

    if (aiProviderSelect) {
        aiProviderSelect.addEventListener('change', refreshAiStatus);
    }

    document.querySelectorAll('[data-ai-prompt]').forEach((button) => {
        button.addEventListener('click', () => {
            if (!aiMessageInput) return;
            aiMessageInput.value = button.getAttribute('data-ai-prompt') || '';
            aiMessageInput.focus();
        });
    });

    refreshAiStatus();
    renderAiMessages();
    renderAiAttachments();

    const formMenuPermission = document.getElementById('form-menu-permission');
    const permissionEmployeeIdInput = document.getElementById('permission-employee-id');
    const permissionEmployeeNameInput = document.getElementById('permission-employee-name');
    const menuPermissionList = document.getElementById('menu-permission-list');
    const btnFillCurrentPermission = document.getElementById('btn-fill-current-permission');

    function getPermissionCheckboxes() {
        return formMenuPermission ? Array.from(formMenuPermission.querySelectorAll('input[type="checkbox"][value]')) : [];
    }

    function fillMenuPermissionForm(permission = {}) {
        if (!formMenuPermission) return;
        if (permissionEmployeeIdInput) permissionEmployeeIdInput.value = permission.employeeId || '';
        if (permissionEmployeeNameInput) permissionEmployeeNameInput.value = permission.name || '';
        const menus = Array.isArray(permission.menus) ? permission.menus : [];
        getPermissionCheckboxes().forEach((checkbox) => {
            checkbox.checked = menus.includes(checkbox.value);
        });
    }

    function renderMenuPermissionList() {
        if (!menuPermissionList) return;

        const permissions = seedCurrentUserMenuPermissions();
        const entries = Object.values(permissions)
            .map((permission) => ({
                employeeId: normalizeEmployeeCode(permission.employeeId),
                name: permission.name || '',
                menus: Array.isArray(permission.menus) ? permission.menus.filter((menuId) => APPROVAL_MENU_IDS.includes(menuId)) : []
            }))
            .filter((permission) => permission.employeeId)
            .sort((a, b) => a.employeeId.localeCompare(b.employeeId, 'th'));

        if (!entries.length) {
            menuPermissionList.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">ยังไม่มีการตั้งค่าสิทธิ์</td></tr>';
            return;
        }

        menuPermissionList.innerHTML = entries.map((permission) => {
            const menuBadges = permission.menus.length
                ? permission.menus.map((menuId) => `<span class="permission-pill">${escapeHtml(getApprovalMenuLabel(menuId))}</span>`).join('')
                : '<span class="text-secondary">ไม่มีสิทธิ์เมนูอนุมัติ</span>';

            return `
                <tr>
                    <td><strong>${escapeHtml(permission.employeeId)}</strong></td>
                    <td>${escapeHtml(permission.name || '-')}</td>
                    <td><div class="permission-pill-row">${menuBadges}</div></td>
                    <td>
                        <div class="company-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-permission-action="edit" data-employee-id="${escapeHtml(permission.employeeId)}">
                                <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                            </button>
                            <button type="button" class="btn-icon text-danger" data-permission-action="delete" data-employee-id="${escapeHtml(permission.employeeId)}" title="ลบสิทธิ์">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function saveMenuPermissionFromForm() {
        if (!formMenuPermission || !permissionEmployeeIdInput) return;
        const employeeId = normalizeEmployeeCode(permissionEmployeeIdInput.value);
        if (!employeeId) {
            alert('กรุณาระบุรหัสพนักงาน');
            return;
        }

        const permissions = loadMenuPermissions();
        const menus = getPermissionCheckboxes()
            .filter((checkbox) => checkbox.checked)
            .map((checkbox) => checkbox.value)
            .filter((menuId) => APPROVAL_MENU_IDS.includes(menuId));

        permissions[employeeId] = {
            employeeId,
            name: permissionEmployeeNameInput?.value.trim() || employeeId,
            menus,
            updatedAt: new Date().toISOString()
        };

        saveMenuPermissions(permissions);
        if (window.TransportApi && typeof window.TransportApi.saveMenuPermission === 'function') {
            try {
                await window.TransportApi.saveMenuPermission(employeeId, {
                    name: permissions[employeeId].name,
                    menus
                });
                await syncMenuPermissionsFromServer();
            } catch (error) {
                console.warn('Menu permission saved locally only:', error.message);
            }
        }
        renderMenuPermissionList();
        applyMenuPermissions();
        alert(`บันทึกสิทธิ์เมนูของ ${employeeId} แล้ว`);
    }

    if (formMenuPermission) {
        formMenuPermission.addEventListener('submit', saveMenuPermissionFromForm);
        formMenuPermission.addEventListener('reset', () => {
            setTimeout(() => fillMenuPermissionForm({}), 0);
        });
    }

    if (btnFillCurrentPermission) {
        btnFillCurrentPermission.addEventListener('click', () => {
            const session = getLoginSession();
            if (!session) {
                alert('ยังไม่มีผู้ใช้งานที่ล็อกอินอยู่');
                return;
            }
            fillMenuPermissionForm({
                employeeId: session.username,
                name: session.displayName || session.username,
                menus: [...APPROVAL_MENU_IDS]
            });
        });
    }

    if (menuPermissionList) {
        menuPermissionList.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-permission-action]');
            if (!button) return;

            const employeeId = normalizeEmployeeCode(button.dataset.employeeId);
            const permissions = loadMenuPermissions();
            const permission = permissions[employeeId];
            if (!permission) return;

            if (button.dataset.permissionAction === 'edit') {
                fillMenuPermissionForm(permission);
                if (permissionEmployeeIdInput) permissionEmployeeIdInput.focus();
                return;
            }

            if (button.dataset.permissionAction === 'delete') {
                const confirmed = window.confirm(`ลบสิทธิ์เมนูของ ${employeeId} ใช่ไหม? หลังลบผู้ใช้นี้จะไม่เห็นเมนูอนุมัติจนกว่าจะตั้งค่าใหม่`);
                if (!confirmed) return;
                delete permissions[employeeId];
                saveMenuPermissions(permissions);
                if (window.TransportApi && typeof window.TransportApi.deleteMenuPermission === 'function') {
                    try {
                        await window.TransportApi.deleteMenuPermission(employeeId);
                    } catch (error) {
                        console.warn('Menu permission deleted locally only:', error.message);
                    }
                }
                renderMenuPermissionList();
                applyMenuPermissions();
            }
        });
    }

    const formPermissionRole = document.getElementById('form-permission-role');
    const permissionRoleIdInput = document.getElementById('permission-role-id');
    const permissionRoleNameInput = document.getElementById('permission-role-name');
    const permissionRoleMenuGrid = document.getElementById('permission-role-menu-grid');
    const permissionRoleList = document.getElementById('permission-role-list');
    const btnResetPermissionRole = document.getElementById('btn-reset-permission-role');
    const btnPermissionSelectAll = document.getElementById('btn-permission-select-all');
    const btnPermissionClear = document.getElementById('btn-permission-clear');
    const formEmployeePermission = document.getElementById('form-employee-permission');
    const employeePermissionIdInput = document.getElementById('employee-permission-id');
    const employeePermissionNameInput = document.getElementById('employee-permission-name');
    const employeePermissionRoleSelect = document.getElementById('employee-permission-role');
    const employeePermissionPasswordInput = document.getElementById('employee-permission-password');
    const employeePermissionOptions = document.getElementById('employee-permission-options');
    const employeePermissionSearchResults = document.getElementById('employee-permission-search-results');
    const employeePermissionList = document.getElementById('employee-permission-list');
    const btnFillCurrentEmployeePermission = document.getElementById('btn-fill-current-employee-permission');
    let permissionEmployeeCache = [];
    let permissionEmployeeSearchTimer = null;

    function createPermissionRoleId(name) {
        const normalized = String(name || '').trim().toLowerCase()
            .replace(/[^a-z0-9ก-ฮะ-์]+/gi, '-')
            .replace(/^-+|-+$/g, '');
        return `role-${normalized || Date.now()}`;
    }

    function getRoleMenuCheckboxes() {
        return permissionRoleMenuGrid ? Array.from(permissionRoleMenuGrid.querySelectorAll('input[type="checkbox"][value]')) : [];
    }

    function getPermissionMenuLabel(menuId) {
        return PERMISSION_MENU_CONFIG.find((item) => item.id === menuId)?.label || getApprovalMenuLabel(menuId);
    }

    function renderPermissionRoleMenuGrid(selectedMenus = []) {
        if (!permissionRoleMenuGrid) return;
        const selected = new Set(Array.isArray(selectedMenus) ? selectedMenus : []);
        permissionRoleMenuGrid.innerHTML = PERMISSION_MENU_CONFIG.map((item) => `
            <label class="permission-toggle">
                <input type="checkbox" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? 'checked' : ''}>
                <span><i class="fa-solid ${escapeHtml(item.icon)}"></i> ${escapeHtml(item.label)}</span>
            </label>
        `).join('');
    }

    function fillPermissionRoleForm(role = {}) {
        if (permissionRoleIdInput) permissionRoleIdInput.value = role.id || '';
        if (permissionRoleNameInput) permissionRoleNameInput.value = role.name || '';
        renderPermissionRoleMenuGrid(Array.isArray(role.menus) ? role.menus : []);
    }

    function renderPermissionRoleSelect() {
        if (!employeePermissionRoleSelect) return;
        const roles = loadPermissionRoles();
        employeePermissionRoleSelect.innerHTML = roles.map((role) => (
            `<option value="${escapeHtml(role.id)}">${escapeHtml(role.name)}</option>`
        )).join('');
    }

    function renderPermissionRoleList() {
        if (!permissionRoleList) return;
        const roles = loadPermissionRoles();
        if (!roles.length) {
            permissionRoleList.innerHTML = '<div class="permission-empty">ยังไม่มีชื่อสิทธิ์</div>';
            return;
        }

        permissionRoleList.innerHTML = roles.map((role) => `
            <div class="permission-role-item">
                <button type="button" class="permission-role-main" data-role-action="edit" data-role-id="${escapeHtml(role.id)}">
                    <strong>${escapeHtml(role.name)}</strong>
                    <span>${role.menus.length} เมนู</span>
                </button>
                <button type="button" class="btn-icon text-danger" data-role-action="delete" data-role-id="${escapeHtml(role.id)}" title="ลบชื่อสิทธิ์">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    function renderEmployeePermissionList() {
        if (!employeePermissionList) return;
        const assignments = loadEmployeeRolePermissions();
        const entries = Object.values(assignments)
            .filter((item) => normalizeEmployeeCode(item.employeeId))
            .sort((a, b) => normalizeEmployeeCode(a.employeeId).localeCompare(normalizeEmployeeCode(b.employeeId), 'th'));

        if (!entries.length) {
            employeePermissionList.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">ยังไม่มีการกำหนดสิทธิ์พนักงาน</td></tr>';
            return;
        }

        employeePermissionList.innerHTML = entries.map((assignment) => {
            const menus = Array.isArray(assignment.menus) ? assignment.menus.filter((menuId) => PERMISSION_MENU_IDS.includes(menuId)) : [];
            const menuBadges = menus.length
                ? menus.slice(0, 8).map((menuId) => `<span class="permission-pill">${escapeHtml(getPermissionMenuLabel(menuId))}</span>`).join('')
                : '<span class="text-secondary">ยังไม่ได้เลือกเมนู</span>';
            const moreCount = menus.length > 8 ? `<span class="permission-pill">+${menus.length - 8}</span>` : '';

            return `
                <tr>
                    <td><strong>${escapeHtml(normalizeEmployeeCode(assignment.employeeId))}</strong></td>
                    <td>${escapeHtml(assignment.name || '-')}</td>
                    <td>${escapeHtml(assignment.roleName || '-')}</td>
                    <td><div class="permission-pill-row">${menuBadges}${moreCount}</div></td>
                    <td>
                        <div class="company-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-employee-permission-action="edit" data-employee-id="${escapeHtml(normalizeEmployeeCode(assignment.employeeId))}">
                                <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                            </button>
                            <button type="button" class="btn-icon text-danger" data-employee-permission-action="delete" data-employee-id="${escapeHtml(normalizeEmployeeCode(assignment.employeeId))}" title="ลบสิทธิ์พนักงาน">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function normalizeEmployeeRow(row) {
        const employeeId = normalizeEmployeeCode(row?.employee_id || row?.employeeId || row?.employeecode);
        return {
            employeeId,
            name: row?.name || row?.fullname || row?.employeeName || employeeId,
            branch: row?.branch || '',
            department: row?.department || row?.dept_code || '',
            position: row?.position || ''
        };
    }

    async function loadPermissionEmployees() {
        if (permissionEmployeeCache.length) return permissionEmployeeCache;
        if (!window.TransportApi || typeof window.TransportApi.listUsers !== 'function') {
            return [];
        }
        try {
            const rows = await window.TransportApi.listUsers();
            permissionEmployeeCache = (Array.isArray(rows) ? rows : [])
                .map(normalizeEmployeeRow)
                .filter((employee) => employee.employeeId);
        } catch (error) {
            console.warn('Employee search unavailable:', error.message);
            permissionEmployeeCache = [];
        }
        return permissionEmployeeCache;
    }

    function fillEmployeePermissionFromDb(employee) {
        if (!employee) return;
        if (employeePermissionIdInput) employeePermissionIdInput.value = employee.employeeId || '';
        if (employeePermissionNameInput) employeePermissionNameInput.value = employee.name || employee.employeeId || '';
        if (employeePermissionSearchResults) employeePermissionSearchResults.innerHTML = '';
    }

    function renderEmployeeSearchOptions(employees) {
        if (employeePermissionOptions) {
            employeePermissionOptions.innerHTML = employees.slice(0, 30).map((employee) => (
                `<option value="${escapeHtml(employee.employeeId)}" label="${escapeHtml(employee.name)}"></option>`
            )).join('');
        }

        if (!employeePermissionSearchResults) return;
        if (!employees.length) {
            employeePermissionSearchResults.innerHTML = '<span class="text-secondary">ไม่พบพนักงานจากฐานข้อมูล</span>';
            return;
        }

        employeePermissionSearchResults.innerHTML = employees.slice(0, 8).map((employee) => `
            <button type="button" class="permission-employee-result" data-employee-id="${escapeHtml(employee.employeeId)}">
                <strong>${escapeHtml(employee.employeeId)}</strong>
                <span>${escapeHtml(employee.name || '-')}</span>
                <small>${escapeHtml([employee.department, employee.position].filter(Boolean).join(' / ') || employee.branch || '')}</small>
            </button>
        `).join('');
    }

    async function searchPermissionEmployees() {
        const query = `${employeePermissionIdInput?.value || ''} ${employeePermissionNameInput?.value || ''}`.trim().toLowerCase();
        if (!query) {
            renderEmployeeSearchOptions([]);
            return;
        }

        const employees = await loadPermissionEmployees();
        const terms = query.split(/\s+/).filter(Boolean);
        const matches = employees.filter((employee) => {
            const haystack = `${employee.employeeId} ${employee.name} ${employee.department} ${employee.position} ${employee.branch}`.toLowerCase();
            return terms.every((term) => haystack.includes(term));
        });
        renderEmployeeSearchOptions(matches);

        const exact = matches.find((employee) => employee.employeeId === normalizeEmployeeCode(employeePermissionIdInput?.value));
        if (exact && employeePermissionNameInput && !employeePermissionNameInput.value.trim()) {
            employeePermissionNameInput.value = exact.name || exact.employeeId;
        }
    }

    function queuePermissionEmployeeSearch() {
        clearTimeout(permissionEmployeeSearchTimer);
        permissionEmployeeSearchTimer = setTimeout(searchPermissionEmployees, 250);
    }

    function renderPermissionManagement() {
        renderPermissionRoleMenuGrid(getRoleMenuCheckboxes().filter((checkbox) => checkbox.checked).map((checkbox) => checkbox.value));
        renderPermissionRoleList();
        renderPermissionRoleSelect();
        renderEmployeePermissionList();
    }

    async function mirrorAssignmentToApprovalPermissions(assignment) {
        const employeeId = normalizeEmployeeCode(assignment.employeeId);
        if (!employeeId) return;

        const approvalMenus = (Array.isArray(assignment.menus) ? assignment.menus : [])
            .filter((menuId) => APPROVAL_MENU_IDS.includes(menuId));
        const permissions = loadMenuPermissions();
        permissions[employeeId] = {
            employeeId,
            name: assignment.name || employeeId,
            menus: approvalMenus,
            updatedAt: assignment.updatedAt || new Date().toISOString()
        };
        saveMenuPermissions(permissions);

        if (window.TransportApi && typeof window.TransportApi.saveMenuPermission === 'function') {
            try {
                await window.TransportApi.saveMenuPermission(employeeId, {
                    name: permissions[employeeId].name,
                    menus: approvalMenus
                });
            } catch (error) {
                console.warn('Employee role permission saved locally only:', error.message);
            }
        }
    }

    if (formPermissionRole) {
        renderPermissionRoleMenuGrid();
        formPermissionRole.addEventListener('submit', () => {
            const name = permissionRoleNameInput?.value.trim() || '';
            if (!name) {
                alert('กรุณาระบุชื่อสิทธิ์');
                return;
            }

            const roleId = permissionRoleIdInput?.value || createPermissionRoleId(name);
            const selectedMenus = getRoleMenuCheckboxes()
                .filter((checkbox) => checkbox.checked)
                .map((checkbox) => checkbox.value)
                .filter((menuId) => PERMISSION_MENU_IDS.includes(menuId));
            const roles = loadPermissionRoles();
            const existingIndex = roles.findIndex((role) => role.id === roleId);
            const nextRole = {
                id: roleId,
                name,
                menus: selectedMenus,
                updatedAt: new Date().toISOString()
            };

            if (existingIndex >= 0) {
                roles[existingIndex] = nextRole;
            } else {
                roles.push(nextRole);
            }

            savePermissionRoles(roles);
            const assignments = loadEmployeeRolePermissions();
            let assignmentChanged = false;
            Object.keys(assignments).forEach((employeeId) => {
                if (assignments[employeeId]?.roleId === nextRole.id) {
                    assignments[employeeId] = {
                        ...assignments[employeeId],
                        roleName: nextRole.name,
                        menus: [...nextRole.menus],
                        updatedAt: nextRole.updatedAt
                    };
                    assignmentChanged = true;
                }
            });
            if (assignmentChanged) {
                saveEmployeeRolePermissions(assignments);
                const mirroredPermissions = loadMenuPermissions();
                Object.values(assignments).forEach((assignment) => {
                    if (assignment?.roleId !== nextRole.id) return;
                    const employeeId = normalizeEmployeeCode(assignment.employeeId);
                    if (!employeeId) return;
                    mirroredPermissions[employeeId] = {
                        employeeId,
                        name: assignment.name || employeeId,
                        menus: (Array.isArray(assignment.menus) ? assignment.menus : []).filter((menuId) => APPROVAL_MENU_IDS.includes(menuId)),
                        updatedAt: assignment.updatedAt
                    };
                });
                saveMenuPermissions(mirroredPermissions);
            }
            fillPermissionRoleForm(nextRole);
            renderPermissionManagement();
            alert(`บันทึกชื่อสิทธิ์ ${name} แล้ว`);
        });
    }

    if (btnResetPermissionRole) {
        btnResetPermissionRole.addEventListener('click', () => fillPermissionRoleForm({}));
    }

    if (btnPermissionSelectAll) {
        btnPermissionSelectAll.addEventListener('click', () => {
            getRoleMenuCheckboxes().forEach((checkbox) => {
                checkbox.checked = true;
            });
        });
    }

    if (btnPermissionClear) {
        btnPermissionClear.addEventListener('click', () => {
            getRoleMenuCheckboxes().forEach((checkbox) => {
                checkbox.checked = false;
            });
        });
    }

    if (permissionRoleList) {
        permissionRoleList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-role-action]');
            if (!button) return;
            const roleId = button.dataset.roleId;
            const roles = loadPermissionRoles();
            const role = roles.find((item) => item.id === roleId);
            if (!role) return;

            if (button.dataset.roleAction === 'edit') {
                fillPermissionRoleForm(role);
                if (permissionRoleNameInput) permissionRoleNameInput.focus();
                return;
            }

            if (button.dataset.roleAction === 'delete') {
                const confirmed = window.confirm(`ลบชื่อสิทธิ์ ${role.name} ใช่ไหม? พนักงานที่ใช้สิทธิ์นี้จะยังอยู่ แต่ควรเลือกสิทธิ์ใหม่ให้ภายหลัง`);
                if (!confirmed) return;
                savePermissionRoles(roles.filter((item) => item.id !== roleId));
                fillPermissionRoleForm({});
                renderPermissionManagement();
            }
        });
    }

    if (formEmployeePermission) {
        formEmployeePermission.addEventListener('submit', async () => {
            const employeeId = normalizeEmployeeCode(employeePermissionIdInput?.value);
            if (!employeeId) {
                alert('กรุณาระบุรหัสพนักงาน');
                return;
            }

            const roleId = employeePermissionRoleSelect?.value || '';
            const role = loadPermissionRoles().find((item) => item.id === roleId);
            if (!role) {
                alert('กรุณาเลือกชื่อสิทธิ์');
                return;
            }

            const assignments = loadEmployeeRolePermissions();
            const passwordValue = employeePermissionPasswordInput?.value.trim() || '';
            if (passwordValue && window.TransportApi && typeof window.TransportApi.createUser === 'function') {
                try {
                    await window.TransportApi.createUser({
                        employeeId,
                        name: employeePermissionNameInput?.value.trim() || employeeId,
                        password: passwordValue
                    });
                    permissionEmployeeCache = [];
                    if (employeePermissionPasswordInput) employeePermissionPasswordInput.value = '';
                } catch (error) {
                    alert(error.message || 'บันทึกรหัสผ่านไม่สำเร็จ');
                    return;
                }
            }
            const assignment = {
                employeeId,
                name: employeePermissionNameInput?.value.trim() || employeeId,
                roleId: role.id,
                roleName: role.name,
                menus: [...role.menus],
                updatedAt: new Date().toISOString()
            };
            assignments[employeeId] = assignment;
            saveEmployeeRolePermissions(assignments);
            await mirrorAssignmentToApprovalPermissions(assignment);
            renderPermissionManagement();
            renderMenuPermissionList();
            applyMenuPermissions();
            alert(`บันทึกสิทธิ์ของ ${employeeId} แล้ว`);
        });
    }

    if (employeePermissionIdInput) {
        employeePermissionIdInput.addEventListener('focus', () => {
            loadPermissionEmployees().then(renderEmployeeSearchOptions);
        });
        employeePermissionIdInput.addEventListener('input', queuePermissionEmployeeSearch);
        employeePermissionIdInput.addEventListener('change', async () => {
            const employees = await loadPermissionEmployees();
            const selected = employees.find((employee) => employee.employeeId === normalizeEmployeeCode(employeePermissionIdInput.value));
            if (selected) fillEmployeePermissionFromDb(selected);
        });
    }

    if (employeePermissionNameInput) {
        employeePermissionNameInput.addEventListener('focus', () => {
            loadPermissionEmployees().then(renderEmployeeSearchOptions);
        });
        employeePermissionNameInput.addEventListener('input', queuePermissionEmployeeSearch);
    }

    if (employeePermissionSearchResults) {
        employeePermissionSearchResults.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-employee-id]');
            if (!button) return;
            const employees = await loadPermissionEmployees();
            const selected = employees.find((employee) => employee.employeeId === normalizeEmployeeCode(button.dataset.employeeId));
            fillEmployeePermissionFromDb(selected);
        });
    }

    if (btnFillCurrentEmployeePermission) {
        btnFillCurrentEmployeePermission.addEventListener('click', () => {
            const session = getLoginSession();
            if (!session) {
                alert('ยังไม่มีผู้ใช้งานที่ล็อกอินอยู่');
                return;
            }
            if (employeePermissionIdInput) employeePermissionIdInput.value = session.username || '';
            if (employeePermissionNameInput) employeePermissionNameInput.value = session.displayName || session.username || '';
        });
    }

    if (employeePermissionList) {
        employeePermissionList.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-employee-permission-action]');
            if (!button) return;
            const employeeId = normalizeEmployeeCode(button.dataset.employeeId);
            const assignments = loadEmployeeRolePermissions();
            const assignment = assignments[employeeId];
            if (!assignment) return;

            if (button.dataset.employeePermissionAction === 'edit') {
                if (employeePermissionIdInput) employeePermissionIdInput.value = assignment.employeeId || '';
                if (employeePermissionNameInput) employeePermissionNameInput.value = assignment.name || '';
                if (employeePermissionRoleSelect) employeePermissionRoleSelect.value = assignment.roleId || '';
                if (employeePermissionIdInput) employeePermissionIdInput.focus();
                return;
            }

            if (button.dataset.employeePermissionAction === 'delete') {
                const confirmed = window.confirm(`ลบสิทธิ์ของ ${employeeId} ใช่ไหม?`);
                if (!confirmed) return;
                delete assignments[employeeId];
                saveEmployeeRolePermissions(assignments);

                const oldPermissions = loadMenuPermissions();
                delete oldPermissions[employeeId];
                saveMenuPermissions(oldPermissions);
                if (window.TransportApi && typeof window.TransportApi.deleteMenuPermission === 'function') {
                    try {
                        await window.TransportApi.deleteMenuPermission(employeeId);
                    } catch (error) {
                        console.warn('Employee approval permission deleted locally only:', error.message);
                    }
                }

                renderPermissionManagement();
                renderMenuPermissionList();
                applyMenuPermissions();
            }
        });
    }

    renderPermissionManagement();

    // -- Fuel Expense Logic --
    function initFuelPrices() {
        const fuelTypeSelect = document.getElementById('fuel-type');
        const fuelPriceInput = document.getElementById('fuel-price');
        const fuelPriceStatus = document.getElementById('fuel-price-status');
        let pttFuelPrices = null;

        if (!fuelTypeSelect || !fuelPriceInput) return;

        const setFuelPriceStatus = (message, state = '') => {
            if (!fuelPriceStatus) return;
            fuelPriceStatus.textContent = message;
            fuelPriceStatus.classList.remove('is-success', 'is-warning', 'is-error');
            if (state) fuelPriceStatus.classList.add(`is-${state}`);
        };

        const getFuelRatePerKm = (oilPrice) => {
            const price = Number(oilPrice);
            if (!Number.isFinite(price)) return null;
            if (price >= 23.51 && price <= 28.50) return 5.5;
            if (price >= 28.51 && price <= 33.50) return 6;
            if (price >= 33.51 && price <= 38.50) return 6.5;
            if (price >= 38.51 && price <= 43.50) return 7;
            if (price >= 43.51 && price <= 48.50) return 7.5;
            return null;
        };

        const applyPttFuelPrice = () => {
            const selectedFuel = fuelTypeSelect.value;
            const selectedLabel = fuelTypeSelect.options[fuelTypeSelect.selectedIndex]?.textContent?.trim() || selectedFuel;
            const mappedPrice = pttFuelPrices?.prices?.[selectedFuel] || null;

            if (!mappedPrice || !Number.isFinite(Number(mappedPrice.price))) {
                fuelPriceInput.value = '';
                delete fuelPriceInput.dataset.source;
                delete fuelPriceInput.dataset.sourcePrice;
                delete fuelPriceInput.dataset.sourceName;
                delete fuelPriceInput.dataset.oilPrice;
                const message = selectedFuel === 'ev'
                    ? 'EV ไม่มีราคาในตาราง ปตท. กรุณากรอกบาท/กม. เอง'
                    : `ไม่พบราคา ปตท. สำหรับ ${selectedLabel} กรุณากรอกบาท/กม. เอง`;
                setFuelPriceStatus(message, 'warning');
                calculateExpenses();
                return;
            }

            const ratePerKm = getFuelRatePerKm(mappedPrice.price);
            if (ratePerKm === null) {
                fuelPriceInput.value = '';
                delete fuelPriceInput.dataset.source;
                delete fuelPriceInput.dataset.sourcePrice;
                delete fuelPriceInput.dataset.sourceName;
                fuelPriceInput.dataset.oilPrice = Number(mappedPrice.price).toFixed(2);
                setFuelPriceStatus(`ราคา ปตท. ${mappedPrice.name} = ${Number(mappedPrice.price).toFixed(2)} บาท/ลิตร ไม่อยู่ในช่วงตาราง กรุณากรอกบาท/กม. เอง`, 'warning');
                calculateExpenses();
                return;
            }

            fuelPriceInput.value = ratePerKm.toFixed(2);
            fuelPriceInput.dataset.source = 'ptt';
            fuelPriceInput.dataset.sourcePrice = fuelPriceInput.value;
            fuelPriceInput.dataset.sourceName = mappedPrice.name || '';
            fuelPriceInput.dataset.oilPrice = Number(mappedPrice.price).toFixed(2);
            setFuelPriceStatus(`ราคา ปตท.: ${mappedPrice.name} ${Number(mappedPrice.price).toFixed(2)} บาท/ลิตร -> ${ratePerKm.toFixed(2)} บาท/กม. (${pttFuelPrices.date || 'วันนี้'})`, 'success');
            calculateExpenses();
        };

        fuelTypeSelect.addEventListener('change', applyPttFuelPrice);

        if (!window.TransportApi || typeof window.TransportApi.getPttFuelPrices !== 'function') {
            setFuelPriceStatus('ยังเชื่อมต่อ API ราคา ปตท. ไม่ได้ กรุณากรอกเอง', 'error');
            return;
        }

        setFuelPriceStatus('กำลังดึงราคาจากตาราง ปตท....', '');
        window.TransportApi.getPttFuelPrices()
            .then((payload) => {
                pttFuelPrices = payload;
                applyPttFuelPrice();
            })
            .catch((error) => {
                fuelPriceInput.value = '';
                delete fuelPriceInput.dataset.source;
                delete fuelPriceInput.dataset.sourcePrice;
                delete fuelPriceInput.dataset.sourceName;
                delete fuelPriceInput.dataset.oilPrice;
                setFuelPriceStatus(`ดึงราคา ปตท. ไม่ได้: ${error.message || 'กรุณากรอกบาท/กม. เอง'}`, 'error');
                calculateExpenses();
            });

    }

    // 2. Travel Plan: Dynamic Travelers
    const btnAddTraveler = document.getElementById('btn-add-traveler');
    const travelersList = document.getElementById('travelers-list');
    let travelerCount = 1;

    if (btnAddTraveler && travelersList) {
        btnAddTraveler.addEventListener('click', () => {
        travelerCount++;
        const newTraveler = document.createElement('div');
        newTraveler.className = 'traveler-card glass-panel-inner mb-3 fade-in';
        newTraveler.innerHTML = `
            <div class="card-header flex-between">
                <h4><i class="fa-solid fa-user"></i> ผู้เดินทางคนที่ ${travelerCount}</h4>
                <button type="button" class="btn-icon text-danger btn-remove-traveler"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="form-row split-row mt-3">
                <div class="input-group">
                    <label>รหัสพนักงาน</label>
                    <input type="text" placeholder="ระบุรหัสพนักงาน" required>
                </div>
                <div class="input-group">
                    <label>ชื่อ - นามสกุล</label>
                    <input type="text" placeholder="ระบุชื่อและนามสกุล" required>
                </div>
            </div>
            <div class="form-row split-row mt-3">
                <div class="input-group">
                    <label>แผนก</label>
                    <input type="text" placeholder="ระบุแผนก" required>
                </div>
                <div class="input-group">
                    <label>ตำแหน่ง</label>
                    <input type="text" placeholder="ระบุตำแหน่ง" required>
                </div>
            </div>
            <div class="form-row split-row mt-3">
                <div class="input-group">
                    <label>เบอร์โทรศัพท์</label>
                    <input type="tel" placeholder="08X-XXX-XXXX" required>
                </div>
                <div class="input-group">
                    <label>รายละเอียดการเดินทาง (Comment)</label>
                    <input type="text" placeholder="ระบุรายละเอียดเพิ่มเติม">
                </div>
            </div>
        `;
        travelersList.appendChild(newTraveler);
        
        newTraveler.querySelector('.btn-remove-traveler').addEventListener('click', function() {
            newTraveler.remove();
            updateTravelerLabels();
        });
        });
    }

    function updateTravelerLabels() {
        const rows = travelersList.querySelectorAll('.traveler-card');
        travelerCount = rows.length;
        rows.forEach((row, index) => {
            const label = row.querySelector('h4');
            label.innerHTML = `<i class="fa-solid fa-user"></i> ผู้เดินทางคนที่ ${index + 1}`;
        });
    }

    // 3. Travel Plan: Dynamic Destinations & Distance Calculation
    const btnAddDestination = document.getElementById('btn-add-destination');
    const destinationsList = document.getElementById('destinations-list');
    const totalDistanceEl = document.getElementById('total-distance');
    let destinationCount = 1;

    function lockFuelDistanceInput(input = document.getElementById('fuel-qty')) {
        if (!input) return;
        input.readOnly = true;
        input.setAttribute('readonly', 'readonly');
        input.setAttribute('aria-readonly', 'true');
        input.tabIndex = -1;
        input.classList.add('locked-calculated-field');
        input.title = 'ระยะทางรวมจากแผนที่ ระบบคำนวณให้อัตโนมัติและแก้ไขเองไม่ได้';
    }

    function syncFuelDistanceFromRoute(distanceKm) {
        const fuelDistanceInput = document.getElementById('fuel-qty');
        if (!fuelDistanceInput) return;

        lockFuelDistanceInput(fuelDistanceInput);
        const numericDistance = Number(distanceKm);
        const safeDistance = Number.isFinite(numericDistance) ? numericDistance : 0;
        fuelDistanceInput.value = safeDistance > 0 ? safeDistance.toFixed(2) : '';
        fuelDistanceInput.dataset.source = 'route-total-distance';
        fuelDistanceInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function calculateTotalDistance() {
        let total = 0;
        document.querySelectorAll('.distance-input').forEach(input => {
            let val = parseFloat(input.value);
            if (!isNaN(val)) total += val;
        });
        if (totalDistanceEl) {
            totalDistanceEl.textContent = total.toFixed(2);
        }
        syncFuelDistanceFromRoute(total);
    }

    let projectJobSearchTimer = null;
    let projectJobRequestSeq = 0;

    function getProjectInputs(siteCard) {
        if (!siteCard) return {};
        const deliveryProjectInput = siteCard.querySelector('.delivery-project-input');
        if (deliveryProjectInput) {
            return { projectInput: deliveryProjectInput };
        }
        const allInputs = Array.from(siteCard.querySelectorAll('input'));
        return {
            codeInput: siteCard.querySelector('.project-code-input') || allInputs[0],
            nameInput: siteCard.querySelector('.project-name-input') || allInputs[1]
        };
    }

    function enhanceProjectJobInputs(scope = document) {
        scope.querySelectorAll('.origin-site, .dest-site').forEach((siteCard) => {
            const { codeInput, nameInput } = getProjectInputs(siteCard);
            if (codeInput) {
                codeInput.classList.add('project-code-input');
                codeInput.setAttribute('autocomplete', 'off');
                codeInput.closest('.input-group')?.classList.add('has-project-autocomplete');
            }
            if (nameInput) {
                nameInput.classList.add('project-name-input');
                nameInput.setAttribute('autocomplete', 'off');
                nameInput.closest('.input-group')?.classList.add('has-project-autocomplete');
            }
        });
        scope.querySelectorAll('.delivery-origin-site, .delivery-dest-site').forEach((siteCard) => {
            const projectInput = siteCard.querySelector('.delivery-project-input') || siteCard.querySelector('.delivery-req:not(.map-link-input)');
            if (!projectInput) return;
            projectInput.classList.add('delivery-project-input');
            projectInput.setAttribute('autocomplete', 'off');
            projectInput.closest('.input-group')?.classList.add('has-project-autocomplete');
        });
    }

    function closeProjectJobSuggestions() {
        document.querySelectorAll('.project-job-suggestions').forEach((panel) => panel.remove());
    }

    function getProjectJobPanel(input) {
        const group = input.closest('.input-group');
        if (!group) return null;
        group.classList.add('has-project-autocomplete');
        group.querySelector('.project-job-suggestions')?.remove();
        const panel = document.createElement('div');
        panel.className = 'project-job-suggestions';
        panel.setAttribute('role', 'listbox');
        group.appendChild(panel);
        return panel;
    }

    function applyProjectJob(siteCard, job) {
        const { codeInput, nameInput, projectInput } = getProjectInputs(siteCard);
        if (projectInput) {
            projectInput.value = [job.code, job.name].filter(Boolean).join(' - ');
            projectInput.dataset.projectJobId = job.id || '';
            projectInput.dataset.projectCode = job.code || '';
            projectInput.dataset.projectName = job.name || '';
        }
        if (codeInput) {
            codeInput.value = job.code || '';
            codeInput.dataset.projectJobId = job.id || '';
        }
        if (nameInput) {
            nameInput.value = job.name || '';
            nameInput.dataset.projectJobId = job.id || '';
        }
        closeProjectJobSuggestions();
    }

    function renderProjectJobSuggestions(input, jobs, message = '') {
        const panel = getProjectJobPanel(input);
        if (!panel) return;

        if (message) {
            panel.innerHTML = `<div class="project-job-empty">${escapeHtml(message)}</div>`;
            return;
        }

        if (!jobs.length) {
            panel.innerHTML = '<div class="project-job-empty">ไม่พบ Job No ที่ตรงกับคำค้นหา</div>';
            return;
        }

        panel.innerHTML = jobs.map((job) => `
            <button type="button" class="project-job-option" data-job-id="${escapeHtml(job.id || '')}">
                <strong>${escapeHtml(job.code || '-')}</strong>
                <span>${escapeHtml(job.name || '-')}</span>
            </button>
        `).join('');

        const siteCard = input.closest('.site-card');
        panel.querySelectorAll('.project-job-option').forEach((button, index) => {
            button.addEventListener('mousedown', (event) => {
                event.preventDefault();
                applyProjectJob(siteCard, jobs[index]);
            });
        });
    }

    async function loadProjectJobSuggestions(input) {
        if (!input || !window.TransportApi || typeof window.TransportApi.listProjectJobs !== 'function') return;

        const search = input.value.trim();
        const requestSeq = ++projectJobRequestSeq;
        renderProjectJobSuggestions(input, [], 'กำลังค้นหาโครงการที่ยังไม่ปิด...');

        try {
            const jobs = await window.TransportApi.listProjectJobs(search, getActiveCompany(), 1000);
            if (requestSeq !== projectJobRequestSeq) return;
            renderProjectJobSuggestions(input, jobs);
        } catch (error) {
            if (requestSeq !== projectJobRequestSeq) return;
            renderProjectJobSuggestions(input, [], `ดึงโครงการที่ยังไม่ปิดไม่ได้: ${error.message || 'กรุณาลองใหม่'}`);
        }
    }

    function scheduleProjectJobSearch(input, delay = 180) {
        clearTimeout(projectJobSearchTimer);
        projectJobSearchTimer = setTimeout(() => loadProjectJobSuggestions(input), delay);
    }

    enhanceProjectJobInputs();

    document.getElementById('form-travel-plan')?.addEventListener('input', (event) => {
        const input = event.target.closest('.project-code-input, .project-name-input, .delivery-project-input');
        if (!input) return;
        scheduleProjectJobSearch(input);
    });

    document.getElementById('form-travel-plan')?.addEventListener('focusin', (event) => {
        const input = event.target.closest('.project-code-input, .project-name-input, .delivery-project-input');
        if (!input) return;
        scheduleProjectJobSearch(input, 0);
    });

    document.getElementById('form-travel-plan')?.addEventListener('keydown', (event) => {
        const input = event.target.closest('.project-code-input, .project-name-input, .delivery-project-input');
        if (!input) return;
        if (event.key === 'Escape') closeProjectJobSuggestions();
        if (event.key === 'Enter') {
            const firstOption = input.closest('.input-group')?.querySelector('.project-job-option');
            if (firstOption) {
                event.preventDefault();
                firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            }
        }
    });

    document.getElementById('form-car-booking')?.addEventListener('input', (event) => {
        const input = event.target.closest('.delivery-project-input');
        if (!input) return;
        scheduleProjectJobSearch(input);
    });

    document.getElementById('form-car-booking')?.addEventListener('focusin', (event) => {
        const input = event.target.closest('.delivery-project-input');
        if (!input) return;
        scheduleProjectJobSearch(input, 0);
    });

    document.getElementById('form-car-booking')?.addEventListener('keydown', (event) => {
        const input = event.target.closest('.delivery-project-input');
        if (!input) return;
        if (event.key === 'Escape') closeProjectJobSuggestions();
        if (event.key === 'Enter') {
            const firstOption = input.closest('.input-group')?.querySelector('.project-job-option');
            if (firstOption) {
                event.preventDefault();
                firstOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            }
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.has-project-autocomplete')) {
            closeProjectJobSuggestions();
        }
    });

    // Bind event to first initial distance input
    const initialDistanceInput = document.querySelector('.distance-input');
    if (initialDistanceInput) {
        initialDistanceInput.addEventListener('input', calculateTotalDistance);
    }

    if (btnAddDestination && destinationsList) {
        btnAddDestination.addEventListener('click', () => {
        destinationCount++;
        const newDest = document.createElement('div');
        newDest.className = 'site-card glass-panel-inner mb-3 dest-site fade-in';
        newDest.innerHTML = `
            <div class="card-header flex-between">
                <h4><i class="fa-solid fa-flag-checkered text-accent"></i> ปลายทางที่ ${destinationCount}</h4>
                <button type="button" class="btn-icon text-danger btn-remove-dest"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="form-row split-row mt-3">
                <div class="input-group">
                    <label>รหัสโครงการ</label>
                    <input type="text" class="project-code-input" placeholder="ระบุรหัส" autocomplete="off" required>
                </div>
                <div class="input-group">
                    <label>ชื่อโครงการ / สถานที่</label>
                    <input type="text" class="project-name-input" placeholder="ระบุชื่อสถานที่" autocomplete="off" required>
                </div>
            </div>
            <div class="form-row mt-3">
                <div class="input-group">
                    <label><i class="fa-brands fa-google"></i> Google Map Link หรือ พิกัด</label>
                    <div class="input-with-action">
                        <input type="text" class="map-link-input" placeholder="คลิกปุ่มเพื่อเลือกสถานที่" readonly required>
                        <button type="button" class="btn-icon text-accent btn-open-map" title="เลือกจากแผนที่"><i class="fa-solid fa-map-location-dot"></i></button>
                        <button type="button" class="btn-icon text-accent btn-check-route" title="เช็คระยะทาง"><i class="fa-solid fa-route"></i></button>
                    </div>
                </div>
            </div>
            <div class="form-row split-row mt-3">
                <div class="input-group">
                    <label>ระยะทางจากจุดก่อนหน้า (กม.)</label>
                    <input type="number" class="distance-input" placeholder="0.00" min="0" step="0.01" required>
                </div>
            </div>
        `;
        destinationsList.appendChild(newDest);
        enhanceProjectJobInputs(newDest);

        newDest.querySelector('.btn-remove-dest').addEventListener('click', function() {
            newDest.remove();
            updateDestinationLabels();
            calculateTotalDistance();
        });
        
        newDest.querySelector('.distance-input').addEventListener('input', calculateTotalDistance);
        });
    }

    function getRouteEndpointsForDestination(row) {
        if (!row) return null;

        const currentInput = row.querySelector('.map-link-input');
        const distanceInput = row.querySelector('.distance-input');

        if (!currentInput || !currentInput.dataset.lat || !currentInput.dataset.lng) {
            return { ready: false, reason: 'destination', currentInput, distanceInput };
        }

        const allRows = Array.from(document.querySelectorAll('.dest-site'));
        const index = allRows.indexOf(row);
        if (index < 0) return { ready: false, reason: 'row', currentInput, distanceInput };

        let startInput = null;
        if (index === 0) {
            startInput = document.querySelector('.origin-site .map-link-input');
        } else {
            startInput = allRows[index - 1].querySelector('.map-link-input');
        }

        if (!startInput || !startInput.dataset.lat || !startInput.dataset.lng) {
            return { ready: false, reason: index === 0 ? 'origin' : 'previous', currentInput, distanceInput, index };
        }

        return {
            ready: true,
            index,
            distanceInput,
            lat1: startInput.dataset.lat,
            lng1: startInput.dataset.lng,
            lat2: currentInput.dataset.lat,
            lng2: currentInput.dataset.lng,
            startName: startInput.value || (index === 0 ? 'จุดต้นทาง' : `ปลายทางที่ ${index}`),
            endName: currentInput.value || `ปลายทางที่ ${index + 1}`,
        };
    }

    async function calculateDestinationDistance(row, options = {}) {
        const { silent = false, button = null } = options;
        const route = getRouteEndpointsForDestination(row);

        if (!route || !route.ready) {
            if (!silent) {
                if (route?.reason === 'destination') {
                    alert('กรุณาเลือกสถานที่ปลายทางผ่านไอคอนแผนที่ก่อน (ต้องเป็นพิกัดจริงเพื่อคำนวณระยะทาง)');
                } else if (route?.reason === 'origin') {
                    alert('กรุณาเลือกสถานที่ "ต้นทาง" ผ่านไอคอนแผนที่ให้ครบถ้วนก่อน เพื่อให้สามารถคำนวณระยะทางได้ถูกต้อง');
                } else if (route?.reason === 'previous') {
                    alert(`กรุณาเลือกพิกัดของ ปลายทางที่ ${route.index} ให้สมบูรณ์ก่อน`);
                }
            }
            return false;
        }

        let originalHtml = '';
        if (button) {
            originalHtml = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            button.disabled = true;
        } else {
            const rowButton = row.querySelector('.btn-check-route');
            if (rowButton) {
                rowButton.classList.add('is-loading');
                rowButton.disabled = true;
            }
        }

        try {
            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${route.lng1},${route.lat1};${route.lng2},${route.lat2}?overview=false&alternatives=true`);
            const data = await response.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const shortestRoute = data.routes.reduce((shortest, item) => (
                    item.distance < shortest.distance ? item : shortest
                ), data.routes[0]);
                const distanceKm = (shortestRoute.distance / 1000).toFixed(2);

                if (route.distanceInput) {
                    route.distanceInput.value = distanceKm;
                    route.distanceInput.dispatchEvent(new Event('input', { bubbles: true }));
                    addTerminalLog(`คำนวณระยะทาง: ${route.startName} -> ${route.endName} = ${distanceKm} กม.`, 'info');
                }
                return true;
            }

            if (!silent) {
                alert('ไม่พบเส้นทางที่รถยนต์สามารถเดินทางได้');
            }
            addTerminalLog(`ล้มเหลว: ไม่พบเส้นทางระหว่าง ${route.startName} และ ${route.endName}`, 'alert');
            return false;
        } catch (err) {
            console.error(err);
            if (!silent) {
                alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์คำนวณระยะทางได้');
            }
            addTerminalLog('ข้อผิดพลาด: ไม่สามารถเชื่อมต่อ OSRM API ได้', 'alert');
            return false;
        } finally {
            if (button) {
                button.innerHTML = originalHtml;
                button.disabled = false;
            } else {
                const rowButton = row.querySelector('.btn-check-route');
                if (rowButton) {
                    rowButton.classList.remove('is-loading');
                    rowButton.disabled = false;
                }
            }
        }
    }

    function autoCalculateDistancesForLocationInput(inputElement) {
        if (!inputElement) return;

        const allRows = Array.from(document.querySelectorAll('.dest-site'));
        const affectedRows = [];
        const originCard = inputElement.closest('.origin-site');
        const destinationCard = inputElement.closest('.dest-site');

        if (originCard) {
            if (allRows[0]) affectedRows.push(allRows[0]);
        }

        if (destinationCard) {
            affectedRows.push(destinationCard);
            const currentIndex = allRows.indexOf(destinationCard);
            if (currentIndex >= 0 && allRows[currentIndex + 1]) {
                affectedRows.push(allRows[currentIndex + 1]);
            }
        }

        [...new Set(affectedRows)].forEach((row) => {
            const route = getRouteEndpointsForDestination(row);
            if (route?.ready) {
                calculateDestinationDistance(row, { silent: true });
            }
        });
    }

    function updateDestinationLabels() {
        const rows = destinationsList.querySelectorAll('.dest-site');
        destinationCount = rows.length;
        rows.forEach((row, index) => {
            const label = row.querySelector('h4');
            label.innerHTML = `<i class="fa-solid fa-flag-checkered text-accent"></i> ปลายทางที่ ${index + 1}`;
        });
    }

    // 4. Expenses Calculation
    const calcInputs = document.querySelectorAll('.calc-input');
    const fuelQty = document.getElementById('fuel-qty');
    const fuelPrice = document.getElementById('fuel-price');
    const fuelTotalEl = document.getElementById('fuel-total');
    
    const accQty = document.getElementById('acc-qty');
    const accPrice = document.getElementById('acc-price');
    const accTotalEl = document.getElementById('acc-total');
    
    const grandTotalEl = document.getElementById('grand-total');

    if (fuelQty) {
        lockFuelDistanceInput(fuelQty);
        ['keydown', 'paste', 'drop', 'wheel'].forEach((eventName) => {
            fuelQty.addEventListener(eventName, (event) => event.preventDefault());
        });
    }

    function calculateExpenses() {
        // Fuel
        let fQ = parseFloat(fuelQty.value) || 0;
        let fP = parseFloat(fuelPrice.value) || 0;
        let fuelTotal = fQ * fP;
        fuelTotalEl.textContent = fuelTotal.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        // Accommodation
        let aQ = parseFloat(accQty.value) || 0;
        let aP = parseFloat(accPrice.value) || 0;
        let accTotal = aQ * aP;
        accTotalEl.textContent = accTotal.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2});

        // Grand Total
        let grandTotal = fuelTotal + accTotal;
        grandTotalEl.textContent = grandTotal.toLocaleString('th-TH', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' บาท';
    }

    calcInputs.forEach(input => {
        input.addEventListener('input', calculateExpenses);
    });

    // === Car Booking Logic: Toggle Types and Dynamic Destinations ===
    const bookingTypeSelect = document.getElementById('booking-type-select');
    const bookingAdminSection = document.getElementById('booking-admin-section');
    const bookingDeliverySection = document.getElementById('booking-delivery-section');
    const adminReqs = document.querySelectorAll('.admin-req');
    const deliveryReqs = document.querySelectorAll('.delivery-req');

    if (bookingTypeSelect) {
        bookingTypeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'general') {
                bookingAdminSection.style.display = 'block';
                bookingDeliverySection.style.display = 'none';
                adminReqs.forEach(el => el.setAttribute('required', 'true'));
                deliveryReqs.forEach(el => el.removeAttribute('required'));
            } else {
                bookingAdminSection.style.display = 'none';
                bookingDeliverySection.style.display = 'block';
                adminReqs.forEach(el => el.removeAttribute('required'));
                deliveryReqs.forEach(el => el.setAttribute('required', 'true'));
                prepareDeliveryNoteBuilder();
            }
        });
    }

    const btnAddDeliveryDest = document.getElementById('btn-add-delivery-dest');
    const deliveryDestinationsList = document.getElementById('delivery-destinations-list');
    let deliveryDestCount = 1;

    if (btnAddDeliveryDest) {
        btnAddDeliveryDest.addEventListener('click', () => {
            deliveryDestCount++;
            const newDest = document.createElement('div');
            newDest.className = 'site-card glass-panel-inner mb-3 delivery-dest-site fade-in';
            newDest.innerHTML = `
                <div class="card-header flex-between mb-2">
                    <h4>ปลายทางที่ ${deliveryDestCount}</h4>
                    <button type="button" class="btn-icon text-danger btn-remove-del-dest"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="form-row split-row mt-3">
                    <div class="input-group">
                        <label>โครงการ</label>
                        <input type="text" placeholder="ระบุโครงการ" class="delivery-req delivery-project-input" autocomplete="off" required>
                    </div>
                    <div class="input-group">
                        <label>หมายเหตุ</label>
                        <input type="text" placeholder="ระบุหมายเหตุ (ถ้ามี)">
                    </div>
                </div>
                <div class="form-row mt-3">
                    <div class="input-group">
                        <label>ชื่อสถานที่ หรือ พิกัดปลายทาง</label>
                        <div class="input-with-action">
                            <input type="text" class="map-link-input delivery-req" placeholder="คลิกเพื่อเลือกสถานที่" readonly required>
                            <button type="button" class="btn-icon text-accent btn-open-map"><i class="fa-solid fa-map-location-dot"></i></button>
                        </div>
                    </div>
                </div>
            `;
            deliveryDestinationsList.appendChild(newDest);
            enhanceProjectJobInputs(newDest);

            newDest.querySelector('.btn-remove-del-dest').addEventListener('click', function() {
                newDest.remove();
                if (window.updateDeliveryDestLabels) window.updateDeliveryDestLabels();
            });
        });
    }

    window.updateDeliveryDestLabels = function() {
        if (!deliveryDestinationsList) return;
        const rows = deliveryDestinationsList.querySelectorAll('.delivery-dest-site');
        deliveryDestCount = rows.length;
        rows.forEach((row, index) => {
            const label = row.querySelector('h4');
            if (label) label.textContent = `ปลายทางที่ ${index + 1}`;
        });
    };

    const deliveryNoteNoInput = document.getElementById('delivery-note-no');
    const deliveryTotalWeightInput = document.getElementById('delivery-total-weight');
    const deliveryProductSelect = document.getElementById('delivery-product-select');
    const btnOpenProductPicker = document.getElementById('btn-open-product-picker');
    const selectedDeliveryProductText = document.getElementById('selected-delivery-product-text');
    const productPickerModal = document.getElementById('product-picker-modal');
    const btnCloseProductPicker = document.getElementById('btn-close-product-picker');
    const productPickerSearchInput = document.getElementById('product-picker-search-input');
    const productPickerList = document.getElementById('product-picker-list');
    const productPickerCount = document.getElementById('product-picker-count');
    const deliveryProductQty = document.getElementById('delivery-product-qty');
    const deliveryProductWeight = document.getElementById('delivery-product-weight');
    const btnRefreshProducts = document.getElementById('btn-refresh-products');
    const btnAddDeliveryProduct = document.getElementById('btn-add-delivery-product');
    const deliveryProductStatus = document.getElementById('delivery-product-status');
    const deliveryNoteItemsBody = document.getElementById('delivery-note-items-body');
    let deliveryProducts = [];
    let deliveryNoteItems = [];
    let deliveryProductsLoaded = false;
    const PRODUCT_PICKER_RENDER_LIMIT = 120;

    function formatDeliveryNumber(value) {
        return (Number(value) || 0).toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function createDeliveryNoteNo() {
        const now = new Date();
        const pad = (value) => String(value).padStart(2, '0');
        return `DN-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }

    function ensureDeliveryNoteNo() {
        if (deliveryNoteNoInput && !deliveryNoteNoInput.value.trim()) {
            deliveryNoteNoInput.value = createDeliveryNoteNo();
        }
    }

    function setDeliveryProductStatus(message, tone = 'muted') {
        if (!deliveryProductStatus) return;
        deliveryProductStatus.textContent = message || '';
        deliveryProductStatus.style.color = tone === 'error' ? 'var(--text-danger)' : 'var(--text-secondary)';
    }

    function productOptionText(product) {
        const weight = formatDeliveryNumber(product.weight_kg);
        const stock = formatDeliveryNumber(product.stock_qty);
        return `${product.sku || '-'} - ${product.name || '-'} (${weight} กก./${product.unit || 'หน่วย'}, คงเหลือ ${stock})`;
    }

    function getSelectedDeliveryProduct() {
        if (!deliveryProductSelect || !deliveryProductSelect.value) return null;
        return deliveryProducts.find((item) => String(item.id) === String(deliveryProductSelect.value)) || null;
    }

    function updateSelectedDeliveryProductText() {
        if (!selectedDeliveryProductText) return;
        const product = getSelectedDeliveryProduct();
        selectedDeliveryProductText.textContent = product
            ? productOptionText(product)
            : 'เลือกสินค้าที่จะใส่ใบส่งของ';
    }

    function filteredDeliveryProducts() {
        const query = (productPickerSearchInput?.value || '').trim().toLowerCase();
        if (!query) return deliveryProducts;
        return deliveryProducts.filter((product) => [
            product.sku,
            product.name,
            product.unit
        ].some((value) => String(value || '').toLowerCase().includes(query)));
    }

    function renderProductPickerList() {
        if (!productPickerList) return;
        const query = (productPickerSearchInput?.value || '').trim();
        if (!query) {
            if (productPickerCount) {
                productPickerCount.textContent = `พร้อมค้นหาจากสินค้า ${deliveryProducts.length} รายการ`;
            }
            productPickerList.innerHTML = `
                <div class="product-picker-empty">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <span>พิมพ์ Code หรือชื่อสินค้าเพื่อเริ่มค้นหา</span>
                </div>
            `;
            return;
        }

        const rows = filteredDeliveryProducts();
        const visibleRows = rows.slice(0, PRODUCT_PICKER_RENDER_LIMIT);
        const hiddenCount = Math.max(rows.length - visibleRows.length, 0);
        if (productPickerCount) {
            productPickerCount.textContent = hiddenCount > 0
                ? `พบสินค้า ${rows.length} รายการ จากทั้งหมด ${deliveryProducts.length} รายการ แสดง ${visibleRows.length} รายการแรก พิมพ์เพิ่มเพื่อกรองให้แคบลง`
                : `พบสินค้า ${rows.length} รายการ จากทั้งหมด ${deliveryProducts.length} รายการ`;
        }

        if (rows.length === 0) {
            productPickerList.innerHTML = `
                <div class="product-picker-empty">
                    <i class="fa-solid fa-box-open"></i>
                    <span>ไม่พบสินค้าที่ตรงกับคำค้นหา</span>
                </div>
            `;
            return;
        }

        productPickerList.innerHTML = visibleRows.map((product) => {
            const isSelected = deliveryProductSelect && String(deliveryProductSelect.value) === String(product.id);
            return `
                <button type="button" class="product-picker-item${isSelected ? ' is-selected' : ''}" data-product-id="${escapeHtml(product.id)}">
                    <span class="product-picker-code">${escapeHtml(product.sku || '-')}</span>
                    <span class="product-picker-name">${escapeHtml(product.name || '-')}</span>
                    <span class="product-picker-meta">
                        ${formatDeliveryNumber(product.weight_kg)} กก./${escapeHtml(product.unit || 'หน่วย')} · คงเหลือ ${formatDeliveryNumber(product.stock_qty)}
                    </span>
                </button>
            `;
        }).join('') + (hiddenCount > 0 ? `
            <div class="product-picker-more">
                มีอีก ${hiddenCount.toLocaleString('th-TH')} รายการ พิมพ์ Code หรือชื่อสินค้าเพิ่มเพื่อค้นหาเร็วขึ้น
            </div>
        ` : '');
    }

    function openProductPicker() {
        if (!productPickerModal) return;
        if (!deliveryProductsLoaded) {
            loadDeliveryProducts();
        }
        productPickerModal.classList.add('is-open');
        productPickerModal.setAttribute('aria-hidden', 'false');
        renderProductPickerList();
        setTimeout(() => productPickerSearchInput?.focus(), 50);
    }

    function closeProductPicker() {
        if (!productPickerModal) return;
        productPickerModal.classList.remove('is-open');
        productPickerModal.setAttribute('aria-hidden', 'true');
    }

    function selectDeliveryProduct(productId) {
        if (!deliveryProductSelect) return;
        deliveryProductSelect.value = String(productId);
        const product = getSelectedDeliveryProduct();
        if (deliveryProductWeight && product && Number(product.weight_kg) > 0) {
            deliveryProductWeight.value = Number(product.weight_kg).toFixed(2);
        }
        updateSelectedDeliveryProductText();
        renderProductPickerList();
        closeProductPicker();
    }

    function renderDeliveryProductOptions() {
        if (!deliveryProductSelect) return;
        if (deliveryProducts.length === 0) {
            deliveryProductSelect.innerHTML = '<option value="">ไม่พบสินค้าใน PostgreSQL</option>';
            updateSelectedDeliveryProductText();
            renderProductPickerList();
            return;
        }

        deliveryProductSelect.innerHTML = '<option value="">เลือกสินค้าที่จะใส่ใบส่งของ</option>' + deliveryProducts.map((product) => {
            return `<option value="${product.id}">${escapeHtml(productOptionText(product))}</option>`;
        }).join('');
        updateSelectedDeliveryProductText();
        renderProductPickerList();
    }

    async function loadDeliveryProducts() {
        if (!deliveryProductSelect || !window.TransportApi) return;
        const activeCompany = typeof getActiveCompany === 'function' ? getActiveCompany() : {};
        deliveryProductSelect.disabled = true;
        setDeliveryProductStatus(`กำลังดึงสินค้าจาก PostgreSQL (${activeCompany.databaseName || 'default'})...`);

        try {
            deliveryProducts = await window.TransportApi.listProducts('', activeCompany, 'all', ['A', 'B', 'D', 'F']);
            deliveryProductsLoaded = true;
            renderDeliveryProductOptions();
            setDeliveryProductStatus(`ดึงสินค้า Code ขึ้นต้นด้วย A/B/D/F แล้ว ${deliveryProducts.length} รายการ จาก ${activeCompany.databaseName || 'default'}`);
        } catch (error) {
            deliveryProducts = [];
            deliveryProductsLoaded = false;
            renderDeliveryProductOptions();
            setDeliveryProductStatus(`ดึงสินค้าไม่ได้: ${error.message}`, 'error');
        } finally {
            deliveryProductSelect.disabled = false;
        }
    }

    function productDimensions(product) {
        const width = Number(product.width_cm) || 0;
        const length = Number(product.length_cm) || 0;
        const height = Number(product.height_cm) || 0;
        return width && length && height ? `${width}x${length}x${height}` : 'ไม่ระบุ';
    }

    function updateDeliveryTotals() {
        const totalWeight = deliveryNoteItems.reduce((sum, item) => sum + item.totalWeightKg, 0);
        if (deliveryTotalWeightInput) {
            deliveryTotalWeightInput.value = totalWeight ? totalWeight.toFixed(2) : '';
        }
    }

    function renderDeliveryNoteItems() {
        if (!deliveryNoteItemsBody) return;

        if (deliveryNoteItems.length === 0) {
            deliveryNoteItemsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">ยังไม่มีสินค้าในใบส่งของ</td></tr>';
            updateDeliveryTotals();
            return;
        }

        deliveryNoteItemsBody.innerHTML = deliveryNoteItems.map((item, index) => `
            <tr>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(item.name)}<br><small class="text-secondary">${escapeHtml(item.dim)}</small></td>
                <td>${formatDeliveryNumber(item.qty)} ${escapeHtml(item.unit)}</td>
                <td>${formatDeliveryNumber(item.totalWeightKg)} กก.</td>
                <td><button type="button" class="btn-icon text-danger" onclick="removeDeliveryNoteItem(${index})"><i class="fa-solid fa-trash"></i></button></td>
            </tr>
        `).join('');
        updateDeliveryTotals();
    }

    window.removeDeliveryNoteItem = function(index) {
        deliveryNoteItems.splice(index, 1);
        renderDeliveryNoteItems();
    };

    function addSelectedDeliveryProduct() {
        if (!deliveryProductSelect || !deliveryProductQty || !deliveryProductWeight) return;
        const productId = Number(deliveryProductSelect.value);
        const qty = Number(deliveryProductQty.value);
        const weightKg = Number(deliveryProductWeight.value);
        const product = deliveryProducts.find((item) => Number(item.id) === productId);

        if (!product) {
            alert('กรุณาเลือกสินค้าจาก PostgreSQL ก่อน');
            return;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
            alert('กรุณาระบุจำนวนสินค้าให้ถูกต้อง');
            return;
        }

        if (!Number.isFinite(weightKg) || weightKg <= 0) {
            alert('กรุณากรอกน้ำหนักต่อหน่วยก่อนเพิ่มสินค้า');
            deliveryProductWeight.focus();
            return;
        }

        const existing = deliveryNoteItems.find((item) => item.productId === productId);
        if (existing) {
            existing.qty += qty;
            existing.totalWeightKg += qty * weightKg;
            existing.weightKg = existing.totalWeightKg / existing.qty;
        } else {
            deliveryNoteItems.push({
                productId,
                sku: product.sku,
                name: product.name,
                unit: product.unit || 'หน่วย',
                qty,
                weightKg,
                totalWeightKg: qty * weightKg,
                dim: productDimensions(product)
            });
        }

        deliveryProductQty.value = '1';
        deliveryProductWeight.value = '';
        if (deliveryProductSelect) deliveryProductSelect.value = '';
        updateSelectedDeliveryProductText();
        renderDeliveryNoteItems();
    }

    function getFirstDeliveryDestinationName() {
        const firstDest = document.querySelector('#delivery-destinations-list .delivery-dest-site');
        if (!firstDest) return '';
        const project = firstDest.querySelector('input');
        const location = firstDest.querySelector('.map-link-input');
        return (project && project.value.trim()) || (location && location.value.trim()) || '';
    }

    function buildDeliveryNotePayload() {
        ensureDeliveryNoteNo();
        if (deliveryNoteItems.length === 0) {
            throw new Error('กรุณาเลือกสินค้าอย่างน้อย 1 รายการเพื่อสร้างใบส่งของ');
        }

        const originProject = document.querySelector('#booking-delivery-section .site-card input');
        const originLocation = document.querySelector('#booking-delivery-section .site-card .map-link-input');

        return {
            noteNo: deliveryNoteNoInput ? deliveryNoteNoInput.value.trim() : createDeliveryNoteNo(),
            customerName: getFirstDeliveryDestinationName(),
            originName: (originProject && originProject.value.trim()) || (originLocation && originLocation.value.trim()) || '',
            destinationName: getFirstDeliveryDestinationName(),
            items: deliveryNoteItems.map((item) => ({
                productId: item.productId,
                sku: item.sku,
                name: item.name,
                unit: item.unit,
                qty: item.qty,
                weightKg: item.weightKg,
                totalWeightKg: item.totalWeightKg,
                dim: item.dim
            }))
        };
    }

    function resetDeliveryNoteBuilder() {
        if (deliveryNoteNoInput) deliveryNoteNoInput.value = createDeliveryNoteNo();
        if (deliveryProductQty) deliveryProductQty.value = '1';
        if (deliveryProductWeight) deliveryProductWeight.value = '';
        deliveryNoteItems = [];
        renderDeliveryNoteItems();
    }

    function prepareDeliveryNoteBuilder() {
        ensureDeliveryNoteNo();
        if (!deliveryProductsLoaded) {
            loadDeliveryProducts();
        }
    }

    if (btnRefreshProducts) {
        btnRefreshProducts.addEventListener('click', loadDeliveryProducts);
    }

    if (btnAddDeliveryProduct) {
        btnAddDeliveryProduct.addEventListener('click', addSelectedDeliveryProduct);
    }

    if (btnOpenProductPicker) {
        btnOpenProductPicker.addEventListener('click', openProductPicker);
    }

    if (btnCloseProductPicker) {
        btnCloseProductPicker.addEventListener('click', closeProductPicker);
    }

    if (productPickerModal) {
        productPickerModal.addEventListener('click', (event) => {
            if (event.target === productPickerModal) {
                closeProductPicker();
            }
        });
    }

    if (productPickerSearchInput) {
        productPickerSearchInput.addEventListener('input', renderProductPickerList);
        productPickerSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeProductPicker();
        });
    }

    if (productPickerList) {
        productPickerList.addEventListener('click', (event) => {
            const item = event.target.closest('.product-picker-item');
            if (!item) return;
            selectDeliveryProduct(item.dataset.productId);
        });
    }

    ensureDeliveryNoteNo();
    renderDeliveryNoteItems();
    if (bookingTypeSelect) {
        bookingTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 3. Car Arrangement: Dynamic Packing List
    const btnAddPacking = document.getElementById('btn-add-packing');
    const packingListBody = document.getElementById('packing-list-body');

    if (btnAddPacking && packingListBody) {
        btnAddPacking.addEventListener('click', () => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" placeholder="ระบุชื่อรายการ" required class="table-input"></td>
            <td><input type="number" min="1" value="1" required class="table-input"></td>
            <td><input type="number" min="0" step="0.1" placeholder="น้ำหนัก" class="table-input"></td>
            <td><button type="button" class="btn-icon text-danger btn-remove-row"><i class="fa-solid fa-trash"></i></button></td>
        `;
        packingListBody.appendChild(tr);

        // Add event listener to remove button
        tr.querySelector('.btn-remove-row').addEventListener('click', function() {
            tr.remove();
        });
        });
    }

    // Add event listener to initial remove button in packing list (if any)
    if (packingListBody) {
        const initialRemoveBtns = packingListBody.querySelectorAll('.btn-remove-row, .text-danger');
        initialRemoveBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const row = this.closest('tr');
                if (row) row.remove();
            });
        });
    }
    
    // Form submit handlers
    document.querySelectorAll('.dynamic-form').forEach(form => {
        if(form.id === 'form-car-booking' || form.id === 'form-car-arrangement') return; // Handled separately
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            
            // --- Custom Logic for Admin Forms ---
            if (form.id === 'form-admin-user') {
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
                try {
                    const data = {
                        employeeId: document.getElementById('admin-emp-id').value,
                        name: document.getElementById('admin-emp-name').value,
                        branch: document.getElementById('admin-emp-branch').value,
                        position: document.getElementById('admin-emp-pos').value,
                        department: document.getElementById('admin-emp-dept').value
                    };
                    await window.TransportApi.createUser(data);
                } catch (error) {
                    alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลผู้ใช้');
                    submitBtn.innerHTML = originalText;
                    return;
                }
            } else if (form.id === 'form-admin-car') {
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
                try {
                    const data = {
                        type: document.getElementById('admin-car-type').value,
                        brand: document.getElementById('admin-car-brand').value,
                        model: document.getElementById('admin-car-model').value,
                        color: document.getElementById('admin-car-color').value,
                        licensePlate: document.getElementById('admin-car-plate').value,
                        fuelType: document.getElementById('admin-car-fuel').value
                    };
                    await window.TransportApi.createCar(data);
                } catch (error) {
                    alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลรถ');
                    submitBtn.innerHTML = originalText;
                    return;
                }
            }

            // Visual feedback to show it works
            submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> บันทึกสำเร็จแล้ว!';
            submitBtn.style.background = '#10b981'; // Tailwind emerald-500
            
            setTimeout(() => {
                submitBtn.innerHTML = originalText;
                submitBtn.style.background = '';
                form.reset();
                if(form.id === 'form-travel-plan') {
                    // keep only first destination row
                    const rows = destinationsList.querySelectorAll('.dest-site');
                    rows.forEach((r, i) => { if (i > 0) r.remove(); });
                    updateDestinationLabels();
                } else if(form.id === 'form-admin-user' || form.id === 'form-admin-car') {
                     // Reload data after successful add
                     if(window.loadAdminData) window.loadAdminData();
                }
            }, 3000);
        });
    });

    // 5. Google Map Modal Logic
    const mapModal = document.getElementById('map-modal');
    const btnCloseMap = document.getElementById('btn-close-map');
    const btnConfirmMap = document.getElementById('btn-confirm-map');
    const mockLocationName = document.getElementById('mock-location-name');
    const mapSearchInput = document.getElementById('map-search-input');
    const btnSearchLocation = document.getElementById('btn-search-location');
    const mapCustomInput = document.getElementById('map-custom-input');
    const btnUseCustomLocation = document.getElementById('btn-use-custom-location');
    const mapSearchResults = document.getElementById('map-search-results');
    const btnToggleMapLayer = document.getElementById('btn-toggle-map-layer');

    let currentMapInputText = null; // To store which input field opened the map
    let locationPickerMap = null;
    let pickerMarker = null;
    let locationMapLayers = {};
    let activeLocationMapLayer = 'street';

    function createSelectedPinIcon() {
        return L.divIcon({
            className: 'selected-location-pin',
            html: '<span class="selected-location-pin__dot"></span>',
            iconSize: [34, 44],
            iconAnchor: [17, 42],
            popupAnchor: [0, -40]
        });
    }

    function updateSelectedMapPin(lat, lng, label, zoom = 15) {
        if (!locationPickerMap || typeof L === 'undefined') return;

        const nextLatLng = [lat, lng];
        if (!pickerMarker) {
            pickerMarker = L.marker(nextLatLng, {
                icon: createSelectedPinIcon(),
                zIndexOffset: 1000
            }).addTo(locationPickerMap);
        } else {
            pickerMarker.setIcon(createSelectedPinIcon());
            pickerMarker.setLatLng(nextLatLng);
            pickerMarker.setZIndexOffset(1000);
        }

        pickerMarker.bindPopup(`<strong>${escapeHtml(label || 'Selected location')}</strong>`).openPopup();
        if (typeof pickerMarker.bringToFront === 'function') {
            pickerMarker.bringToFront();
        }
        locationPickerMap.invalidateSize();
        locationPickerMap.setView(nextLatLng, zoom, { animate: true });
    }

    function updateLocationMapLayerButton() {
        if (!btnToggleMapLayer) return;

        const satelliteActive = activeLocationMapLayer === 'satellite';
        btnToggleMapLayer.classList.toggle('is-satellite', satelliteActive);
        btnToggleMapLayer.title = satelliteActive ? 'สลับเป็นแผนที่ปกติ' : 'สลับเป็นภาพดาวเทียม';
        btnToggleMapLayer.innerHTML = satelliteActive
            ? '<i class="fa-solid fa-map"></i><span>แผนที่</span>'
            : '<i class="fa-solid fa-satellite"></i><span>ดาวเทียม</span>';
    }

    function setLocationMapLayer(layerName) {
        if (!locationPickerMap || !locationMapLayers[layerName]) return;

        Object.values(locationMapLayers).forEach((layer) => {
            if (locationPickerMap.hasLayer(layer)) {
                locationPickerMap.removeLayer(layer);
            }
        });

        locationMapLayers[layerName].addTo(locationPickerMap);
        activeLocationMapLayer = layerName;
        updateLocationMapLayerButton();
        locationPickerMap.invalidateSize();
    }

    function toggleLocationMapLayer() {
        setLocationMapLayer(activeLocationMapLayer === 'satellite' ? 'street' : 'satellite');
    }

    // Function to open modal
    function openMapModal(inputElement) {
        currentMapInputText = inputElement;
        if (mapModal) {
            mapModal.classList.add('active');
            mapModal.style.display = 'flex';
        }
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        if(mapSearchInput) {
            mapSearchInput.value = '';
            setTimeout(() => mapSearchInput.focus(), 100);
        }
        if(mapCustomInput) mapCustomInput.value = '';
        
        // Initialize interactive map if not already done
        if (!locationPickerMap) {
            const mapContainer = document.getElementById('location-picker-map');
            if (mapContainer && typeof L !== 'undefined') {
                locationPickerMap = L.map('location-picker-map').setView([13.736717, 100.523186], 13);
                locationMapLayers = {
                    street: L.tileLayer('https://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}', {
                        maxZoom: 20,
                        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                        attribution: '&copy; Google Maps'
                    }),
                    satellite: L.tileLayer('https://{s}.google.com/vt?lyrs=s,h&x={x}&y={y}&z={z}', {
                        maxZoom: 20,
                        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                        attribution: '&copy; Google Maps'
                    })
                };
                activeLocationMapLayer = 'street';
                locationMapLayers.street.addTo(locationPickerMap);
                updateLocationMapLayerButton();
                
                pickerMarker = L.marker([13.736717, 100.523186], {
                    icon: createSelectedPinIcon(),
                    zIndexOffset: 1000
                }).addTo(locationPickerMap);
                
                // Show existing pinned locations
                const bluePinIcon = L.divIcon({
                    className: 'custom-blue-pin',
                    html: '<i class="fa-solid fa-location-pin" style="color: #3b82f6; font-size: 1.5rem; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"></i>',
                    iconSize: [20, 24],
                    iconAnchor: [10, 24]
                });

                if (typeof MOCK_LOCATIONS !== 'undefined') {
                    MOCK_LOCATIONS.forEach(loc => {
                        if (loc.lat && loc.lng) {
                            const pinnedMarker = L.marker([loc.lat, loc.lng], {icon: bluePinIcon}).addTo(locationPickerMap);
                            pinnedMarker.bindPopup(`<b>${loc.name}</b><br><button type="button" onclick="selectLocation('${loc.name}')" class="btn btn-sm btn-primary mt-2 flex-center" style="font-size: 0.75rem;"><i class="fa-solid fa-check"></i> เลือกจุดนี้</button>`);
                        }
                    });
                }
                
                locationPickerMap.on('click', async function(e) {
                    const { lat, lng } = e.latlng;
                    updateSelectedMapPin(lat, lng, 'ตำแหน่งที่เลือก', locationPickerMap.getZoom());
                    
                    try {
                        // Reverse geocoding using Nominatim
                        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
                        const data = await response.json();
                        let finalName = 'ตำแหน่งพิกัดไร้ชื่อ';
                        if (data && data.address) {
                            const addr = data.address;
                            const subdistrict = addr.suburb || addr.village || addr.quarter || addr.hamlet || '';
                            const district = addr.county || addr.city || addr.town || addr.municipality || addr.district || '';
                            const province = addr.state || addr.province || '';
                            
                            let nameArr = [];
                            if(subdistrict && subdistrict !== district) nameArr.push(`ต.${subdistrict}`);
                            if(district && district !== province) nameArr.push(`อ.${district}`);
                            if(province) nameArr.push(`จ.${province}`);
                            
                            if (nameArr.length > 0) {
                                finalName = nameArr.join(' ');
                            } else if (data.display_name) {
                                finalName = data.display_name.split(',').slice(0,2).join(', ');
                            }
                        }
                        
                        if (mockLocationName) mockLocationName.textContent = finalName;
                        if (mapCustomInput) mapCustomInput.value = finalName;
                        if (mapSearchInput) mapSearchInput.value = ''; // clear search since we picked map
                        
                    } catch (err) {
                        console.error('Reverse Geocode failed', err);
                        mockLocationName.textContent = `พิกัด: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                        if (mapCustomInput) mapCustomInput.value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    }
                });
            }
        }
        
        // Ensure map renders correctly after modal div becomes visible
        if (locationPickerMap) {
            setTimeout(() => {
                locationPickerMap.invalidateSize();
            }, 100);
        }
    }

    // Function to close modal
    function closeMapModal() {
        if (mapModal) {
            mapModal.classList.remove('active');
            mapModal.style.display = 'none';
        }
        document.body.style.overflow = '';
        currentMapInputText = null;
        if (mapSearchResults) {
            mapSearchResults.style.display = 'none';
        }
    }

    // Attach event listeners using Event Delegation (handles dynamic rows automatically)
    document.addEventListener('click', (e) => {
        // If clicking on the map button (or its icon inside)
        const btnMap = e.target.closest('.btn-open-map');
        if (btnMap) {
            const inputGroup = btnMap.closest('.input-with-action');
            if (inputGroup) {
                const targetInput = inputGroup.querySelector('.map-link-input');
                if (targetInput) openMapModal(targetInput);
            }
            return;
        }

        // If clicking directly on the readonly text input
        if (e.target.classList.contains('map-link-input')) {
            openMapModal(e.target);
        }
        
        // Handle Calculate Distance button click
        const btnCheckRoute = e.target.closest('.btn-check-route');
        if (btnCheckRoute) {
            const row = btnCheckRoute.closest('.dest-site');
            if (!row) return;
            calculateDestinationDistance(row, { button: btnCheckRoute });
        }
    });

    if (btnCloseMap) btnCloseMap.addEventListener('click', closeMapModal);
    if (btnToggleMapLayer) btnToggleMapLayer.addEventListener('click', toggleLocationMapLayer);

    // Close if clicking outside the modal content
    if (mapModal) {
        mapModal.addEventListener('click', (e) => {
            if (e.target === mapModal) {
                closeMapModal();
            }
        });
    }

    function confirmSelectedLocation() {
        if (currentMapInputText && mockLocationName) {
            currentMapInputText.value = mockLocationName.textContent;
            
            // Save coordinates onto the input field for route calculation
            if (pickerMarker) {
                const pos = pickerMarker.getLatLng();
                currentMapInputText.dataset.lat = pos.lat;
                currentMapInputText.dataset.lng = pos.lng;
            }
            // Trigger input change event for distance auto-calculation
            currentMapInputText.dispatchEvent(new Event('change', { bubbles: true }));
            autoCalculateDistancesForLocationInput(currentMapInputText);
        }
        closeMapModal();
    }

    if (btnConfirmMap) {
        btnConfirmMap.addEventListener('click', confirmSelectedLocation);
    }

    if (btnUseCustomLocation) {
        btnUseCustomLocation.addEventListener('click', () => {
            if (mapCustomInput && mapCustomInput.value.trim() !== "") {
                const val = mapCustomInput.value.trim();
                
                // Allow parsing Lat, Lng coordinates from Google Maps (e.g., 13.1234, 100.5678) 
                // or extracting from Google Maps URL (e.g. @13.1234,100.5678)
                const latLngMatch = val.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
                
                if (latLngMatch) {
                    const lat = parseFloat(latLngMatch[1]);
                    const lng = parseFloat(latLngMatch[2]);
                    
                    updateSelectedMapPin(lat, lng, "พิกัด: " + lat.toFixed(4) + ", " + lng.toFixed(4), 14);
                    
                    if (mockLocationName) mockLocationName.textContent = "พิกัด: " + lat.toFixed(4) + ", " + lng.toFixed(4);
                    
                    // Auto-confirm
                    if (typeof confirmSelectedLocation === 'function') confirmSelectedLocation();
                } else {
                    // It's a text string, we MUST geocode it, otherwise pickerMarker stays at old position
                    const originalHtml = btnUseCustomLocation.innerHTML;
                    btnUseCustomLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                    btnUseCustomLocation.disabled = true;
                    
                    const encodedQuery = encodeURIComponent(val);
                    fetch(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1`)
                        .then(res => res.json())
                        .then(data => {
                            if (data && data.length > 0) {
                                const lat = parseFloat(data[0].lat);
                                const lng = parseFloat(data[0].lon);
                                updateSelectedMapPin(lat, lng, val, 14);
                                if (mockLocationName) mockLocationName.textContent = val;
                                if (typeof confirmSelectedLocation === 'function') confirmSelectedLocation();
                            } else {
                                alert('ไม่พบพิกัดจากชื่อสถานที่นี้ กรุณาขยับหมุดบนแผนที่ด้วยตนเองเพื่อความแม่นยำ (ระบบไม่สามารถคำนวณระยะทางได้หากไม่มีพิกัด)');
                            }
                        })
                        .catch(err => {
                            console.error(err);
                            alert('ไม่สามารถค้นหาพิกัดได้ กรุณาปักหมุดบนแผนที่ด้วยตนเอง');
                        })
                        .finally(() => {
                            btnUseCustomLocation.innerHTML = originalHtml;
                            btnUseCustomLocation.disabled = false;
                        });
                }
            } else {
                alert('กรุณาระบุชื่อสถานที่ หรือวางพิกัดที่ต้องการใช้');
            }
        });
    }

    // Handle Map Search interactions
    const MOCK_LOCATIONS = [
        { name: "นิคมอุตสาหกรรมอมตะซิตี้ (ชลบุรี)", lat: 13.4150, lng: 101.0016 },
        { name: "นิคมอุตสาหกรรมอมตะซิตี้ (ระยอง)", lat: 12.9818, lng: 101.1219 },
        { name: "นิคมอุตสาหกรรมบางปู", lat: 13.5284, lng: 100.6559 },
        { name: "นิคมอุตสาหกรรมลาดกระบัง", lat: 13.7570, lng: 100.7811 },
        { name: "คลังสินค้าวังน้อย (อยุธยา)", lat: 14.2312, lng: 100.7180 },
        { name: "ท่าเรือแหลมฉบัง", lat: 13.0805, lng: 100.8936 },
        { name: "สนามบินสุวรรณภูมิ", lat: 13.6899, lng: 100.7501 },
        { name: "สนามบินดอนเมือง", lat: 13.9125, lng: 100.6042 },
        { name: "ศูนย์กระจายสินค้าบางนา", lat: 13.6331, lng: 100.7020 },
        { name: "สำนักงานใหญ่ (รัชดา)", lat: 13.7801, lng: 100.5746 },
        { name: "สาขาเชียงใหม่", lat: 18.7883, lng: 98.9853 },
        { name: "สาขาขอนแก่น", lat: 16.4322, lng: 102.8236 },
        { name: "สาขาสุราษฎร์ธานี", lat: 9.1382, lng: 99.3217 }
    ];

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    const COMPANY_STORAGE_KEY = 'tms_companies_v1';
    const ACTIVE_COMPANY_KEY = 'tms_active_company_id';
    const DEFAULT_COMPANIES = [
        {
            id: 'aes',
            code: 'AES',
            nameTh: 'บริษัท เออีเอสคอน จำกัด',
            nameEn: 'AESCON CO.,LTD.',
            databaseName: 'aes_sitecontroldb',
            taxId: '',
            phone: '',
            address: '',
            docPrefix: 'TR',
            logoPath: 'assets/logos/aescon-logo.png'
        },
        {
            id: 'sge',
            code: 'SGE',
            nameTh: 'บริษัท สยาม โกลบอล เอ็นจิเนียริ่ง จำกัด',
            nameEn: 'SIAM GLOBAL ENGINEERING CO.,LTD.',
            databaseName: 'sge_sitecontroldb',
            taxId: '',
            phone: '',
            address: '',
            docPrefix: 'TR',
            logoPath: 'assets/logos/sge-logo.png'
        }
    ];

    function normalizeCompany(company) {
        const code = String(company.code || '').trim().toUpperCase();
        const currentDatabaseName = String(company.databaseName || '').trim();
        const defaultDatabaseByCode = {
            AES: 'aes_sitecontroldb',
            AESCON: 'aes_sitecontroldb',
            SGE: 'sge_sitecontroldb'
        };
        const defaultLogoByCode = {
            AES: 'assets/logos/aescon-logo.png',
            AESCON: 'assets/logos/aescon-logo.png',
            SGE: 'assets/logos/sge-logo.png'
        };

        return {
            id: company.id || `company-${Date.now()}`,
            code,
            nameTh: String(company.nameTh || '').trim(),
            nameEn: String(company.nameEn || '').trim(),
            databaseName: currentDatabaseName === 'aescon_sitecontroldb'
                ? 'aes_sitecontroldb'
                : (currentDatabaseName || defaultDatabaseByCode[code] || ''),
            taxId: String(company.taxId || '').trim(),
            phone: String(company.phone || '').trim(),
            address: String(company.address || '').trim(),
            docPrefix: String(company.docPrefix || 'TR').trim().toUpperCase(),
            logoPath: String(company.logoPath || defaultLogoByCode[code] || '').trim()
        };
    }

    function loadCompanies() {
        try {
            const parsed = JSON.parse(localStorage.getItem(COMPANY_STORAGE_KEY) || '[]');
            if (Array.isArray(parsed) && parsed.length) {
                return parsed.map(normalizeCompany);
            }
        } catch (error) {
            console.warn('Company settings unavailable:', error);
        }
        return DEFAULT_COMPANIES.map(normalizeCompany);
    }

    function saveCompanies(companies) {
        localStorage.setItem(COMPANY_STORAGE_KEY, JSON.stringify(companies.map(normalizeCompany)));
    }

    function renderCompanyLogo(company, className = 'company-logo-img') {
        if (company.logoPath) {
            return `<img class="${className}" src="${escapeHtml(company.logoPath)}" alt="${escapeHtml(company.nameEn || company.nameTh || company.code || 'Company logo')}">`;
        }
        return '<i class="fa-solid fa-building"></i>';
    }

    function getActiveCompany() {
        const companies = loadCompanies();
        const activeId = localStorage.getItem(ACTIVE_COMPANY_KEY) || companies[0]?.id;
        return companies.find((company) => company.id === activeId) || companies[0] || normalizeCompany(DEFAULT_COMPANIES[0]);
    }

    function setActiveCompany(companyId) {
        localStorage.setItem(ACTIVE_COMPANY_KEY, companyId);
        const selectedCompany = loadCompanies().find((company) => company.id === companyId);
        if (selectedCompany) {
            markCompanySelected(selectedCompany);
        }
        renderCompanyList();
        updateCompanyDisplays();
        deliveryProducts = [];
        deliveryProductsLoaded = false;
        renderDeliveryProductOptions();
        if (deliveryProductSelect) {
            loadDeliveryProducts();
        }
    }

    function updateCompanyDisplays() {
        const company = getActiveCompany();
        const activeName = document.getElementById('company-active-name');
        const activeDetail = document.getElementById('company-active-detail');
        const activePrefix = document.getElementById('company-active-prefix');
        const activeTax = document.getElementById('company-active-tax');
        const activeDatabase = document.getElementById('company-active-database');
        const activeLogo = document.getElementById('company-active-logo');
        const travelPlanCompany = document.getElementById('travel-plan-active-company');

        if (activeName) activeName.textContent = company.nameEn || company.nameTh || company.code;
        if (activeDetail) activeDetail.textContent = company.nameTh || company.address || '-';
        if (activePrefix) activePrefix.textContent = company.docPrefix || 'TR';
        if (activeTax) activeTax.textContent = company.taxId || '-';
        if (activeDatabase) activeDatabase.textContent = company.databaseName || '-';
        if (activeLogo) {
            if (company.logoPath) {
                activeLogo.src = company.logoPath;
                activeLogo.alt = `${company.nameEn || company.nameTh || company.code || 'Company'} logo`;
                activeLogo.hidden = false;
            } else {
                activeLogo.hidden = true;
            }
        }
        if (sidebarCompanyBadge) {
            const companyName = company.nameEn || company.nameTh || company.code || 'Company';
            if (sidebarCompanyLogo && company.logoPath) {
                sidebarCompanyLogo.src = company.logoPath;
                sidebarCompanyLogo.alt = `${companyName} logo`;
                sidebarCompanyLogo.hidden = false;
            } else if (sidebarCompanyLogo) {
                sidebarCompanyLogo.hidden = true;
            }
            if (sidebarCompanyName) sidebarCompanyName.textContent = companyName;
            sidebarCompanyBadge.hidden = !company;
        }
        if (travelPlanCompany) travelPlanCompany.textContent = company.nameEn || company.nameTh || company.code;
    }

    function resetCompanyForm() {
        const form = document.getElementById('form-company');
        if (form) form.reset();
        const prefixInput = document.getElementById('company-doc-prefix');
        if (prefixInput) prefixInput.value = 'TR';
    }

    function renderCompanyList() {
        const companyList = document.getElementById('company-list');
        if (!companyList) return;

        const companies = loadCompanies();
        const activeId = localStorage.getItem(ACTIVE_COMPANY_KEY) || companies[0]?.id;

        if (!companies.length) {
            companyList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">ยังไม่มีข้อมูลบริษัท</td></tr>';
            return;
        }

        companyList.innerHTML = companies.map((company) => {
            const isActive = company.id === activeId;
            return `
                <tr>
                    <td>${isActive ? '<span class="company-status-pill"><i class="fa-solid fa-check"></i> ใช้งานอยู่</span>' : '<span class="text-secondary">ยังไม่เลือก</span>'}</td>
                    <td><strong>${escapeHtml(company.code || '-')}</strong></td>
                    <td>
                        <strong>${escapeHtml(company.nameTh || '-')}</strong><br>
                        <span class="text-secondary">${escapeHtml(company.nameEn || '-')}</span>
                    </td>
                    <td><code>${escapeHtml(company.databaseName || '-')}</code></td>
                    <td>${escapeHtml(company.docPrefix || 'TR')}</td>
                    <td>
                        <div class="company-actions">
                            <button type="button" class="btn btn-secondary btn-sm" data-company-action="select" data-company-id="${escapeHtml(company.id)}" ${isActive ? 'disabled' : ''}>
                                <i class="fa-solid fa-building-circle-check"></i> เลือกบริษัท
                            </button>
                            <button type="button" class="btn-icon text-danger" data-company-action="delete" data-company-id="${escapeHtml(company.id)}" title="ลบบริษัท">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    const companyList = document.getElementById('company-list');
    if (companyList) {
        companyList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-company-action]');
            if (!button) return;

            const action = button.dataset.companyAction;
            const companyId = button.dataset.companyId;
            const companies = loadCompanies();

            if (action === 'select') {
                setActiveCompany(companyId);
                return;
            }

            if (action === 'delete') {
                if (companies.length <= 1) {
                    alert('ต้องมีข้อมูลบริษัทอย่างน้อย 1 บริษัท');
                    return;
                }

                const company = companies.find((item) => item.id === companyId);
                const confirmed = window.confirm(`ลบบริษัท ${company?.nameTh || company?.nameEn || company?.code || ''} ใช่ไหม?`);
                if (!confirmed) return;

                const nextCompanies = companies.filter((item) => item.id !== companyId);
                saveCompanies(nextCompanies);
                if (localStorage.getItem(ACTIVE_COMPANY_KEY) === companyId) {
                    localStorage.setItem(ACTIVE_COMPANY_KEY, nextCompanies[0].id);
                    markCompanySelected(nextCompanies[0]);
                }
                renderCompanyList();
                updateCompanyDisplays();
                renderCompanyGateOptions();
            }
        });
    }

    const formCompany = document.getElementById('form-company');
    if (formCompany) {
        formCompany.addEventListener('submit', () => {
            const code = getInputValue(formCompany, '#company-code').toUpperCase();
            const nameTh = getInputValue(formCompany, '#company-name-th');
            const nameEn = getInputValue(formCompany, '#company-name-en');
            const databaseName = getInputValue(formCompany, '#company-database');

            if (!code || !nameTh || !nameEn || !databaseName) {
                alert('กรุณากรอกรหัสบริษัท ชื่อไทย ชื่ออังกฤษ และฐานข้อมูล');
                return;
            }

            const companies = loadCompanies();
            const existingIndex = companies.findIndex((company) => company.code.toUpperCase() === code);
            const company = normalizeCompany({
                id: existingIndex >= 0 ? companies[existingIndex].id : (window.crypto?.randomUUID ? window.crypto.randomUUID() : `company-${Date.now()}`),
                code,
                nameTh,
                nameEn,
                taxId: getInputValue(formCompany, '#company-tax-id'),
                phone: getInputValue(formCompany, '#company-phone'),
                address: getInputValue(formCompany, '#company-address'),
                databaseName,
                docPrefix: getInputValue(formCompany, '#company-doc-prefix', 'TR')
            });

            if (existingIndex >= 0) {
                companies[existingIndex] = company;
            } else {
                companies.push(company);
            }

            saveCompanies(companies);
            localStorage.setItem(ACTIVE_COMPANY_KEY, company.id);
            markCompanySelected(company);
            resetCompanyForm();
            renderCompanyList();
            updateCompanyDisplays();
            renderCompanyGateOptions();
        });
    }

    const resetCompanyButton = document.getElementById('btn-reset-company-form');
    if (resetCompanyButton) {
        resetCompanyButton.addEventListener('click', resetCompanyForm);
    }

    const openCompanySettingsButton = document.getElementById('btn-open-company-settings');
    if (openCompanySettingsButton) {
        openCompanySettingsButton.addEventListener('click', () => {
            const companyNavButton = document.querySelector('.nav-btn[data-target="company-settings"]');
            if (companyNavButton) companyNavButton.click();
        });
    }

    renderCompanyList();
    updateCompanyDisplays();
    applyAuthState();

    function formatSearchResultName(place) {
        return place.name || place.display_name || `${Number(place.lat).toFixed(5)}, ${Number(place.lon).toFixed(5)}`;
    }

    function buildLocationSearchQueries(query) {
        const normalized = query
            .replace(/บริษัท|จำกัด|co\.?|ltd\.?|limited/gi, ' ')
            .replace(/[()"'“”‘’.,]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const tokens = normalized.split(' ').filter(token => token.length > 2);
        const queries = [
            query,
            normalized,
            `${normalized} ประเทศไทย`,
            tokens.slice(0, 2).join(' '),
            ...tokens
        ].map(item => item.trim()).filter(Boolean);

        return [...new Set(queries)];
    }

    async function searchNominatim(queryText) {
        const encodedQuery = encodeURIComponent(queryText);
        let response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&addressdetails=1&limit=8&countrycodes=th&accept-language=th,en`);
        let data = response.ok ? await response.json() : [];

        if (!Array.isArray(data) || data.length === 0) {
            response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&addressdetails=1&limit=8&accept-language=th,en`);
            data = response.ok ? await response.json() : [];
        }

        return Array.isArray(data) ? data : [];
    }

    async function searchGooglePlaces(query) {
        try {
            const response = await fetch(`/api/places/search?query=${encodeURIComponent(query)}`);
            if (!response.ok) return [];

            const payload = await response.json();
            if (!payload.configured || !Array.isArray(payload.results)) return [];

            return payload.results.map((place) => ({
                ...place,
                lat: parseFloat(place.lat),
                lon: parseFloat(place.lon),
                matchedQuery: place.source === 'locationiq' ? 'LocationIQ' : 'Google Maps'
            })).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
        } catch (error) {
            console.warn('Google Places search unavailable:', error);
            return [];
        }
    }

    async function searchRealLocations(query) {
        const seen = new Set();
        const allResults = [];

        const googleResults = await searchGooglePlaces(query);
        googleResults.forEach((place) => {
            const key = place.place_id ? `google:${place.place_id}` : `${place.lat.toFixed(5)},${place.lon.toFixed(5)}:${place.display_name}`;
            if (seen.has(key)) return;
            seen.add(key);
            allResults.push(place);
        });

        if (allResults.length > 0) {
            return allResults.slice(0, 10);
        }

        for (const queryText of buildLocationSearchQueries(query)) {
            const results = await searchNominatim(queryText);
            results.forEach((place) => {
                const lat = parseFloat(place.lat);
                const lng = parseFloat(place.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

                const key = place.osm_type && place.osm_id
                    ? `${place.osm_type}:${place.osm_id}`
                    : `${lat.toFixed(5)},${lng.toFixed(5)}:${place.display_name}`;
                if (seen.has(key)) return;

                seen.add(key);
                allResults.push({ ...place, lat, lon: lng, matchedQuery: queryText });
            });
        }

        return allResults.slice(0, 10);
    }

    function renderLocationResults(results, query, localMatches) {
        if (!mapSearchResults) return;

        mapSearchResults.style.display = 'block';
        mapSearchResults.innerHTML = '';

        if (results.length > 0) {
            mapSearchResults.insertAdjacentHTML('beforeend', `
                <div class="search-group-title"><i class="fa-solid fa-magnifying-glass-location"></i> ผลการค้นหาจากแผนที่ / ชื่อใกล้เคียง</div>
            `);

            results.forEach((place) => {
                const name = formatSearchResultName(place);
                const address = place.display_name || name;
                const lat = parseFloat(place.lat);
                const lng = parseFloat(place.lon);
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'search-result-item search-result-place';
                item.innerHTML = `
                    <i class="fa-solid fa-location-dot"></i>
                    <span class="search-result-copy">
                        <strong>${escapeHtml(name)}</strong>
                        <small>${escapeHtml(address)}</small>
                        <em>${lat.toFixed(5)}, ${lng.toFixed(5)}</em>
                        ${place.matchedQuery && place.matchedQuery !== query ? `<em>เจอจากคำค้นใกล้เคียง: ${escapeHtml(place.matchedQuery)}</em>` : ''}
                    </span>
                `;
                item.addEventListener('click', () => window.selectLocation({ name, displayName: address, lat, lng }));
                mapSearchResults.appendChild(item);
            });
        } else {
            mapSearchResults.insertAdjacentHTML('beforeend', `
                <div class="search-no-match">
                    <i class="fa-solid fa-circle-exclamation text-accent"></i> ไม่พบสถานที่จริงหรือชื่อใกล้เคียงจากแผนที่สำหรับ "${escapeHtml(query)}"
                </div>
            `);
        }

        if (localMatches.length > 0) {
            mapSearchResults.insertAdjacentHTML('beforeend', `
                <div class="search-group-title"><i class="fa-solid fa-bookmark"></i> หมุดที่บันทึกไว้ / แนะนำ</div>
            `);

            localMatches.forEach((loc) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'search-result-item search-result-place';
                item.innerHTML = `
                    <i class="fa-solid fa-map-pin"></i>
                    <span class="search-result-copy">
                        <strong>${escapeHtml(loc.name)}</strong>
                        <small>พิกัดที่บันทึกไว้ในระบบ</small>
                        <em>${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}</em>
                    </span>
                `;
                item.addEventListener('click', () => window.selectLocation(loc));
                mapSearchResults.appendChild(item);
            });
        }

        const manualItem = document.createElement('button');
        manualItem.type = 'button';
        manualItem.className = 'search-result-item search-result-custom';
        manualItem.innerHTML = `
            <i class="fa-solid fa-map-location-dot"></i>
            <span class="search-result-copy">
                <strong>ไม่ใช่ผลลัพธ์เหล่านี้? ปักหมุดเองบนแผนที่</strong>
                <small>ระบบจะไม่สร้างหมุดอัตโนมัติถ้าไม่มีพิกัดจริงจากแผนที่</small>
            </span>
        `;
        manualItem.addEventListener('click', () => {
            if (mapSearchResults) mapSearchResults.style.display = 'none';
            if (mockLocationName) mockLocationName.textContent = 'คลิกบนแผนที่เพื่อเลือกพิกัด';
            const mapEl = document.getElementById('location-picker-map');
            if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        mapSearchResults.appendChild(manualItem);
    }

    async function executeLocationSearch() {
        const query = mapSearchInput.value.trim();
        if (!query) return;

        const originalHtml = btnSearchLocation.innerHTML;
        btnSearchLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังค้นหา...';
        btnSearchLocation.disabled = true;

        const localMatches = MOCK_LOCATIONS.filter(loc =>
            loc.name.toLowerCase().includes(query.toLowerCase())
        );

        try {
            const latLngMatch = query.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
            if (latLngMatch) {
                const lat = parseFloat(latLngMatch[1]);
                const lng = parseFloat(latLngMatch[2]);
                renderLocationResults([{ name: query, display_name: `พิกัด ${query}`, lat, lon: lng }], query, localMatches);
                window.selectLocation({ name: query, lat, lng });
                return;
            }

            const results = await searchRealLocations(query);
            renderLocationResults(results, query, localMatches);

            if (results.length > 0 && locationPickerMap && pickerMarker) {
                const lat = parseFloat(results[0].lat);
                const lng = parseFloat(results[0].lon);
                updateSelectedMapPin(lat, lng, formatSearchResultName(results[0]), 13);
                if (mockLocationName) mockLocationName.textContent = formatSearchResultName(results[0]);
            } else {
                if (mockLocationName) mockLocationName.textContent = 'ไม่พบพิกัดจริงจากแผนที่';
            }
        } catch (err) {
            console.error(err);
            renderLocationResults([], query, localMatches);
        } finally {
            btnSearchLocation.innerHTML = originalHtml;
            btnSearchLocation.disabled = false;
        }
    }

    window.selectLocation = function(location) {
        const selected = typeof location === 'string' ? { name: location } : location;
        const locationName = selected.name || selected.displayName || '';

        if (mapSearchResults) mapSearchResults.style.display = 'none';
        if (mockLocationName) mockLocationName.textContent = locationName;
        if (mapSearchInput) mapSearchInput.value = locationName;
        if (mapCustomInput) mapCustomInput.value = locationName;

        const lat = Number(selected.lat);
        const lng = Number(selected.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && locationPickerMap) {
            updateSelectedMapPin(lat, lng, locationName, 15);
        }

        const mapEl = document.getElementById('location-picker-map');
        if (mapEl) {
            setTimeout(() => mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }
    };

    if (btnSearchLocation) {
        btnSearchLocation.addEventListener('click', executeLocationSearch);
    }
    
    if (mapSearchInput) {
        mapSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            const latLngMatch = query.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
            if (latLngMatch && locationPickerMap && pickerMarker) {
                const lat = parseFloat(latLngMatch[1]);
                const lng = parseFloat(latLngMatch[2]);
                updateSelectedMapPin(lat, lng, query, 14);
            }
        });
        
        mapSearchInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                executeLocationSearch();
            }
        });
    }

    // === 6. Professional GPS Tracking Engine ===
    const btnOpenMobileSync = document.getElementById('btn-open-mobile-sync');
    const qrPopover = document.getElementById('qr-popover');
    const btnClosePopover = document.getElementById('btn-close-popover');
    const syncQrContainer = document.getElementById('sync-qr-code');
    const syncUrlText = document.getElementById('sync-url-text');
    const btnDownloadQr = document.getElementById('btn-download-qr');

    const btnToggleTravelerGps = document.getElementById('btn-toggle-traveler-gps');
    const travelerGpsStatus = document.getElementById('traveler-gps-status');
    const btnToggleDriverGps = document.getElementById('btn-toggle-driver-gps');
    const driverGpsStatus = document.getElementById('driver-gps-status');
    const driverSpeedEl = document.getElementById('driver-speed');
    const travelerCoordsEl = document.getElementById('traveler-coords');

    const btnStartJourney = document.getElementById('btn-start-journey');
    const btnEndJourney = document.getElementById('btn-end-journey');
    const gpsLogBody = document.getElementById('gps-log-body');

    let travelerConnected = false;
    let driverConnected = false;
    let journeyInterval = null;
    let gpsLiveMap = null;
    let travelerMarker = null;
    let driverMarker = null;
    let liveTripPath = null;
    let mockTravelData = {
        lat: 13.7801, // Start at HQ
        lng: 100.5746,
        speed: 0
    };

    // Initialize GPS Live Map
    function initGpsLiveMap() {
        const mapDiv = document.getElementById('gps-live-map');
        if (mapDiv && !gpsLiveMap && typeof L !== 'undefined') {
            gpsLiveMap = L.map('gps-live-map', { zoomControl: false }).setView([13.7801, 100.5746], 12);
            L.tileLayer('http://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['0', '1', '2', '3']
            }).addTo(gpsLiveMap);

            const travelerIcon = L.divIcon({
                className: 'live-marker',
                html: '<div style="background: #3b82f6; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);"></div>',
                iconSize: [14, 14]
            });
            const driverIcon = L.divIcon({
                className: 'live-marker',
                html: '<div style="background: #f97316; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(249, 115, 22, 0.5);"></div>',
                iconSize: [14, 14]
            });

            travelerMarker = L.marker([13.7801, 100.5746], {icon: travelerIcon}).addTo(gpsLiveMap);
            driverMarker = L.marker([13.7801, 100.5746], {icon: driverIcon}).addTo(gpsLiveMap);
        }
    }

    // QR Sync Logic (Popover)
    if (btnOpenMobileSync) {
        btnOpenMobileSync.addEventListener('click', (e) => {
            e.stopPropagation();
            if (qrPopover) {
                const isActive = qrPopover.classList.contains('active');
                
                if (!isActive) {
                    // Generate simulated trip URL
                    const tripId = "TRIP-" + Math.floor(Math.random() * 9999);
                    const syncUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?tripId=${tripId}&role=driver`;
                    
                    if (syncUrlText) syncUrlText.textContent = syncUrl;
                    if (syncQrContainer) {
                        syncQrContainer.innerHTML = '';
                        new QRCode(syncQrContainer, {
                            text: syncUrl,
                            width: 180,
                            height: 180,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.H
                        });
                    }
                    qrPopover.classList.add('active');
                } else {
                    qrPopover.classList.remove('active');
                }
            }
        });

        if (btnClosePopover) {
            btnClosePopover.addEventListener('click', () => {
                qrPopover.classList.remove('active');
            });
        }

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (qrPopover && qrPopover.classList.contains('active') && !qrPopover.contains(e.target) && e.target !== btnOpenMobileSync) {
                qrPopover.classList.remove('active');
            }
        });

        if (btnDownloadQr) {
            btnDownloadQr.addEventListener('click', () => {
                const qrImg = syncQrContainer.querySelector('img');
                const qrCanvas = syncQrContainer.querySelector('canvas');
                let dataUrl = (qrImg && qrImg.src) ? qrImg.src : (qrCanvas ? qrCanvas.toDataURL("image/png") : '');

                if (dataUrl) {
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.download = `TMS-Sync-QR-${new Date().getTime()}.png`;
                    link.click();
                }
            });
        }
    }

    function closeSyncModal() {
        if (qrPopover) qrPopover.classList.remove('active');
    }


    function addTerminalLog(message, type = 'info') {
        if (!gpsLogBody) return;
        if (gpsLogBody.querySelector('.init')) gpsLogBody.innerHTML = '';

        const now = new Date();
        const timeStr = now.toLocaleTimeString('th-TH', { hour12: false });
        
        const line = document.createElement('div');
        line.className = `term-line ${type} fade-in`;
        line.innerHTML = `<span class="timestamp">${timeStr}</span> ${message}`;
        
        gpsLogBody.appendChild(line);
        gpsLogBody.scrollTop = gpsLogBody.scrollHeight;
    }

    function toggleProfessionalGps(type) {
        const isTraveler = type === 'traveler';
        const isConnected = isTraveler ? travelerConnected : driverConnected;
        const statusEl = isTraveler ? travelerGpsStatus : driverGpsStatus;
        const btnEl = isTraveler ? btnToggleTravelerGps : btnToggleDriverGps;
        const cardClass = isTraveler ? '.traveler-card' : '.driver-card';
        const card = document.querySelector(cardClass);

        if (!isConnected) { // Connecting
            btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btnEl.disabled = true;
            addTerminalLog(`Establishing link to ${isTraveler ? 'Traveler' : 'Driver'} GPS unit...`, 'init');
            
            setTimeout(() => {
                const newState = true;
                if (isTraveler) travelerConnected = true; else driverConnected = true;
                
                statusEl.parentElement.parentElement.parentElement.classList.add('online');
                statusEl.querySelector('.badge-text').textContent = 'Live System Online';
                btnEl.innerHTML = '<i class="fa-solid fa-unlink"></i>';
                btnEl.className = 'btn-icon text-danger';
                btnEl.disabled = false;
                
                addTerminalLog(`${isTraveler ? 'Traveler' : 'Driver'} GPS Handshake: OK. Bitrate: 48kbps`, 'coord');
                checkGpsReady();
                initGpsLiveMap();
            }, 1500);
        } else { // Disconnecting
            if (isTraveler) travelerConnected = false; else driverConnected = false;
            statusEl.parentElement.parentElement.parentElement.classList.remove('online');
            statusEl.querySelector('.badge-text').textContent = 'รอการเชื่อมต่อ...';
            btnEl.innerHTML = '<i class="fa-solid fa-link"></i>';
            btnEl.className = 'btn-icon text-accent';
            addTerminalLog(`Terminiating link for ${isTraveler ? 'Traveler' : 'Driver'}... Session ended.`, 'alert');
            
            if (journeyInterval) endJourney('🔴 Emergency STOP: GPS Signal Lost.');
            checkGpsReady();
        }
    }

    if (btnToggleTravelerGps) btnToggleTravelerGps.addEventListener('click', () => toggleProfessionalGps('traveler'));
    if (btnToggleDriverGps) btnToggleDriverGps.addEventListener('click', () => toggleProfessionalGps('driver'));

    function checkGpsReady() {
        btnStartJourney.disabled = !(travelerConnected && driverConnected && !journeyInterval);
    }

    function startJourney() {
        btnStartJourney.disabled = true;
        btnEndJourney.disabled = false;
        
        addTerminalLog('CRITICAL: Dispatch sequence initiated.', 'init');
        addTerminalLog('Tracking active. All systems nominal.', 'coord');
        
        let step = 0;
        journeyInterval = setInterval(() => {
            step++;
            // Simulate jitter and movement towards destination
            const jitterLat = (Math.random() - 0.5) * 0.0005;
            const jitterLng = (Math.random() - 0.5) * 0.0005;
            
            mockTravelData.lat += 0.0008 + jitterLat; // Fast simulation
            mockTravelData.lng += 0.0004 + jitterLng;
            mockTravelData.speed = Math.floor(60 + Math.random() * 15);
            
            // Update UI Gauges
            if (driverSpeedEl) driverSpeedEl.textContent = mockTravelData.speed;
            if (travelerCoordsEl) travelerCoordsEl.textContent = `${mockTravelData.lat.toFixed(4)}, ${mockTravelData.lng.toFixed(4)}`;
            
            // Update Map
            const newPos = [mockTravelData.lat, mockTravelData.lng];
            if (travelerMarker) travelerMarker.setLatLng(newPos);
            if (driverMarker) driverMarker.setLatLng([newPos[0] - 0.0002, newPos[1] - 0.0001]); // Slightly behind
            
            if (gpsLiveMap && step % 2 === 0) gpsLiveMap.panTo(newPos);
            
            if (step % 5 === 0) {
                addTerminalLog(`Live Telemetry: Lat ${newPos[0].toFixed(5)} Lng ${newPos[1].toFixed(5)} Speed ${mockTravelData.speed}km/h`, 'coord');
            }
            
            if (step >= 50) { // End of mock journey
                endJourney();
            }
        }, 1500);
    }

    function endJourney(reason = 'MISSION SCAN COMPLETE: Vehicle arrived at destination.') {
        if (journeyInterval) {
            clearInterval(journeyInterval);
            journeyInterval = null;
        }
        addTerminalLog(reason, 'init');
        btnEndJourney.disabled = true;
        checkGpsReady();
    }

    if (btnStartJourney) btnStartJourney.addEventListener('click', startJourney);
    if (btnEndJourney) btnEndJourney.addEventListener('click', () => endJourney());

    // Auto-init dashboard map if container exists (Wait for potential tab switch)
    setTimeout(initGpsLiveMap, 1000);

    // === 7. Approval Flow Simulation Logic ===
    const formTravelPlan = document.getElementById('form-travel-plan');
    const approvalStatusSection = document.getElementById('approval-status-section');
    const btnSubmitTravelPlan = document.getElementById('btn-submit-travel-plan');
    const btnPrintTravelPlan = document.getElementById('btn-print-travel-plan');
    const travelPlanPrintout = document.getElementById('travel-plan-printout');
    
    // Steps
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const step4 = document.getElementById('step-4');
    const step5 = document.getElementById('step-5');

    // Mock State for separate menus
    let travelRequests = [];
    let requestCounter = 1000;
    let lastTravelRequestNo = '';
    
    // References to table bodies
    const managerListBody = document.getElementById('manager-list-body');
    const hrListBody = document.getElementById('hr-list-body');
    const mdListBody = document.getElementById('md-list-body');
    const accountingListBody = document.getElementById('accounting-list-body');
    const travelStatusSearchInput = document.getElementById('travel-status-search');
    const btnTravelStatusSearch = document.getElementById('btn-travel-status-search');
    const btnRefreshTravelStatus = document.getElementById('btn-refresh-travel-status');
    const travelStatusDetail = document.getElementById('travel-status-detail');
    const travelStatusLiveTrackingSlot = document.getElementById('travel-status-live-tracking-slot');
    const travelLiveTrackingPanel = document.getElementById('travel-live-tracking-panel');
    const travelStatusListBody = document.getElementById('travel-status-list-body');
    const travelRequestPreviewModal = document.getElementById('travel-request-preview-modal');
    const travelRequestPreviewContent = document.getElementById('travel-request-preview-content');
    const btnCloseTravelPreview = document.getElementById('btn-close-travel-preview');
    const btnCloseTravelPreviewFooter = document.getElementById('btn-close-travel-preview-footer');
    const btnPrintTravelPreview = document.getElementById('btn-print-travel-preview');
    const btnAddTravelPlanAttachment = document.getElementById('btn-add-travel-plan-attachment');
    const travelPlanAttachmentInput = document.getElementById('travel-plan-attachment-input');
    const travelPlanAttachmentList = document.getElementById('travel-plan-attachment-list');
    let travelStatusRequests = [];
    let selectedTravelStatusId = '';
    let selectedTravelStatusRequest = null;
    let previewTravelRequestData = null;
    let pendingTravelPlanAttachments = [];

    const TRAVEL_STATUS_META = {
        manager: {
            label: 'รอหัวหน้าอนุมัติ',
            headline: 'ยังไม่อนุมัติครบ',
            tone: 'warning',
            icon: 'fa-user-tie'
        },
        hr: {
            label: 'หัวหน้าอนุมัติแล้ว / รอ HR ตรวจสอบ',
            headline: 'อนุมัติแล้วบางส่วน',
            tone: 'info',
            icon: 'fa-users-gear'
        },
        md: {
            label: 'HR ตรวจสอบแล้ว / รอ MD อนุมัติ',
            headline: 'อนุมัติแล้วบางส่วน',
            tone: 'info',
            icon: 'fa-user-tie'
        },
        accounting: {
            label: 'MD อนุมัติแล้ว / รอบัญชีทำจ่าย',
            headline: 'อนุมัติครบแล้ว',
            tone: 'success',
            icon: 'fa-file-invoice-dollar'
        },
        approved: {
            label: 'อนุมัติครบแล้ว',
            headline: 'อนุมัติครบแล้ว',
            tone: 'success',
            icon: 'fa-circle-check'
        },
        completed: {
            label: 'ทำจ่ายเสร็จสิ้น',
            headline: 'เสร็จสิ้นแล้ว',
            tone: 'success',
            icon: 'fa-circle-check'
        },
        rejected: {
            label: 'ไม่อนุมัติ / ถูกปฏิเสธ',
            headline: 'ไม่อนุมัติ',
            tone: 'danger',
            icon: 'fa-circle-xmark'
        }
    };

    const TRAVEL_STATUS_STEPS = [
        { key: 'created', label: 'สร้างเอกสาร', icon: 'fa-file-circle-plus' },
        { key: 'manager', label: 'หัวหน้า', icon: 'fa-user-tie' },
        { key: 'hr', label: 'HR', icon: 'fa-users-gear' },
        { key: 'md', label: 'MD', icon: 'fa-user-check' },
        { key: 'accounting', label: 'บัญชี', icon: 'fa-file-invoice-dollar' },
        { key: 'completed', label: 'เสร็จสิ้น', icon: 'fa-circle-check' }
    ];

    function updateApprovalDate(stepEl) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('th-TH');
        const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        stepEl.querySelector('.status-date').textContent = `${dateStr} ${timeStr}`;
    }

    function setStepState(stepEl, state) {
        stepEl.className = `step ${state}`;
        if (state === 'completed') {
            updateApprovalDate(stepEl);
        }
    }

    function getTravelRequestNo(request) {
        return request?.id ? `TRV-${request.id}` : '-';
    }

    function normalizeTravelRequestId(value) {
        const matched = String(value || '').trim().match(/(?:TRV[-\s]*)?(\d+)/i);
        return matched ? matched[1] : '';
    }

    function getTravelStatusMeta(status) {
        return TRAVEL_STATUS_META[status] || {
            label: status || 'ไม่ทราบสถานะ',
            headline: 'ไม่ทราบสถานะ',
            tone: 'muted',
            icon: 'fa-circle-question'
        };
    }

    function formatTravelStatusDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function formatTravelStatusDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatFileSize(bytes = 0) {
        const size = Number(bytes) || 0;
        if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
        if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
        return `${size} B`;
    }

    function fileToTravelAttachment(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = String(reader.result || '');
                resolve({
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    size: file.size,
                    data: result.includes(',') ? result.split(',')[1] : result,
                });
            };
            reader.onerror = () => reject(new Error(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`));
            reader.readAsDataURL(file);
        });
    }

    function renderPendingTravelPlanAttachments() {
        if (!travelPlanAttachmentList) return;
        if (!pendingTravelPlanAttachments.length) {
            travelPlanAttachmentList.innerHTML = '<span class="text-secondary">ยังไม่มีไฟล์แนบ</span>';
            return;
        }

        travelPlanAttachmentList.innerHTML = pendingTravelPlanAttachments.map((attachment, index) => `
            <span class="travel-attachment-pill">
                <i class="fa-solid fa-file"></i>
                ${escapeHtml(attachment.name)}
                <small>${formatFileSize(attachment.size)}</small>
                <button type="button" data-remove-pending-travel-attachment="${index}" title="ลบไฟล์"><i class="fa-solid fa-xmark"></i></button>
            </span>
        `).join('');
    }

    function getAttachmentUrl(attachment) {
        if (!attachment?.data) return '#';
        return `data:${attachment.type || 'application/octet-stream'};base64,${attachment.data}`;
    }

    function renderTravelAttachmentPanel(request, context = 'status') {
        const attachments = Array.isArray(request?.attachments) ? request.attachments : [];
        const requestId = request?.id || '';
        const listHtml = attachments.length
            ? attachments.map((attachment) => `
                <div class="travel-attachment-row">
                    <a href="${getAttachmentUrl(attachment)}" download="${escapeHtml(attachment.name || 'attachment')}" target="_blank" rel="noreferrer">
                        <i class="fa-solid fa-paperclip"></i>
                        <span>${escapeHtml(attachment.name || 'ไฟล์แนบ')}</span>
                    </a>
                    <small>${formatFileSize(attachment.size)}${attachment.uploadedBy ? ` · ${escapeHtml(attachment.uploadedBy)}` : ''}</small>
                    <button type="button" class="btn-icon text-danger" data-delete-travel-attachment-id="${escapeHtml(attachment.id || '')}" data-request-id="${escapeHtml(requestId)}" title="ลบไฟล์">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `).join('')
            : '<div class="travel-attachment-empty">ยังไม่มีไฟล์แนบในเอกสารนี้</div>';

        return `
            <section class="travel-attachment-panel travel-attachment-panel-${escapeHtml(context)}">
                <div class="travel-attachment-header">
                    <div>
                        <h4><i class="fa-solid fa-paperclip text-accent"></i> ไฟล์แนบเอกสาร</h4>
                        <p class="text-secondary text-sm">แนบไฟล์เพิ่มได้ทุกสถานะของเอกสาร</p>
                    </div>
                    <label class="btn btn-secondary btn-sm">
                        <i class="fa-solid fa-paperclip"></i> แนบไฟล์
                        <input type="file" data-travel-attachment-input="${escapeHtml(requestId)}" multiple hidden>
                    </label>
                </div>
                <div class="travel-attachment-list">${listHtml}</div>
            </section>
        `;
    }

    async function uploadTravelRequestAttachments(requestId, files, source = 'status') {
        if (!requestId || !files.length) return;
        const attachments = await Promise.all(files.map(fileToTravelAttachment));
        const actor = getCurrentApprovalActor();
        await window.TransportApi.addTravelRequestAttachments(requestId, attachments, {
            uploadedBy: actor.approverName || actor.employeeCode || ''
        });

        const request = await window.TransportApi.getTravelRequest(requestId);
        if (source === 'preview') {
            previewTravelRequestData = request;
            renderTravelRequestPreview(request);
        } else {
            selectedTravelStatusRequest = request;
            renderTravelStatusDetail(request);
            await loadTravelStatusRequests({ preserveDetail: true });
        }
    }

    function renderTravelStatusBadge(status) {
        const meta = getTravelStatusMeta(status);
        return `<span class="travel-status-badge is-${meta.tone}"><i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.label)}</span>`;
    }

    function getTravelStatusStepState(status, stepIndex) {
        if (status === 'rejected') return stepIndex === 1 ? 'rejected' : (stepIndex === 0 ? 'completed' : 'pending');
        if (status === 'completed') return 'completed';
        const activeIndexByStatus = {
            manager: 1,
            hr: 2,
            md: 3,
            accounting: 4,
            approved: 4
        };
        const activeIndex = activeIndexByStatus[status] ?? 1;
        if (stepIndex < activeIndex) return 'completed';
        if (stepIndex === activeIndex) return 'active';
        return 'pending';
    }

    function renderTravelStatusSteps(status, request) {
        return TRAVEL_STATUS_STEPS.map((step, index) => {
            const state = getTravelStatusStepState(status, index);
            let dateText = '-';
            if (index === 0) dateText = formatTravelStatusDateTime(request.created_at);
            else if (state === 'active') dateText = 'กำลังรอ';
            else if (state === 'completed' && status === 'completed' && index === TRAVEL_STATUS_STEPS.length - 1) dateText = formatTravelStatusDateTime(request.updated_at);
            else if (state === 'completed') dateText = 'ผ่านแล้ว';

            return `
                <div class="travel-status-step is-${state}">
                    <div class="travel-status-step-icon"><i class="fa-solid ${step.icon}"></i></div>
                    <strong>${escapeHtml(step.label)}</strong>
                    <span>${escapeHtml(dateText)}</span>
                </div>
            `;
        }).join('');
    }

    function getTravelStatusRouteText(request) {
        const destinations = Array.isArray(request.destinations)
            ? request.destinations.map((destination) => destination.name).filter(Boolean)
            : [];
        if (destinations.length) {
            return `${request.origin_name || '-'} -> ${destinations.join(', ')}`;
        }
        return request.origin_name || '-';
    }

    function setTravelStatusLiveTrackingVisible(isVisible, request = null) {
        if (!travelStatusLiveTrackingSlot || !travelLiveTrackingPanel) return;

        if (travelLiveTrackingPanel.parentElement !== travelStatusLiveTrackingSlot) {
            travelStatusLiveTrackingSlot.appendChild(travelLiveTrackingPanel);
        }

        travelStatusLiveTrackingSlot.hidden = !isVisible;
        travelLiveTrackingPanel.hidden = !isVisible;

        if (isVisible) {
            initGpsLiveMap();
            setTimeout(() => {
                if (gpsLiveMap) gpsLiveMap.invalidateSize();
            }, 80);

            if (request) {
                addTerminalLog(`Document ${getTravelRequestNo(request)} opened. Live tracking console ready.`, 'init');
            }
        } else if (qrPopover) {
            qrPopover.classList.remove('active');
        }
    }

    function renderTravelStatusDetail(request) {
        if (!travelStatusDetail) return;
        if (!request) {
            selectedTravelStatusRequest = null;
            setTravelStatusLiveTrackingVisible(false);
            travelStatusDetail.innerHTML = `
                <div class="travel-status-empty">
                    <i class="fa-solid fa-file-circle-question"></i>
                    <span>เลือกเอกสารจากตารางด้านล่าง หรือค้นหาเลขเอกสารเพื่อดูสถานะ</span>
                </div>
            `;
            return;
        }

        selectedTravelStatusRequest = request;
        const meta = getTravelStatusMeta(request.status);
        const travelers = Array.isArray(request.travelers) && request.travelers.length
            ? request.travelers.map((traveler) => traveler.name).filter(Boolean).join(', ')
            : (request.traveler_name || '-');
        const routeText = getTravelStatusRouteText(request);

        travelStatusDetail.innerHTML = `
            <div class="travel-status-summary is-${meta.tone}">
                <div>
                    <span class="text-secondary">เลขเอกสาร</span>
                    <h3>${escapeHtml(getTravelRequestNo(request))}</h3>
                </div>
                <div>
                    <span class="text-secondary">ผลตรวจสอบ</span>
                    <strong><i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.headline)}</strong>
                </div>
                <div>
                    <span class="text-secondary">สถานะปัจจุบัน</span>
                    ${renderTravelStatusBadge(request.status)}
                </div>
            </div>
            <div class="travel-status-progress">
                ${renderTravelStatusSteps(request.status, request)}
            </div>
            <div class="travel-status-action-bar">
                <button type="button" class="btn btn-secondary btn-sm" data-print-travel-status-id="${escapeHtml(request.id)}">
                    <i class="fa-solid fa-print"></i> ปริ้นเอ้าท์
                </button>
            </div>
            ${renderTravelAttachmentPanel(request, 'status')}
            <div class="travel-status-info-grid">
                <div>
                    <span>ผู้เดินทาง</span>
                    <strong>${escapeHtml(travelers || '-')}</strong>
                </div>
                <div>
                    <span>วันที่เดินทาง</span>
                    <strong>${escapeHtml(formatTravelStatusDate(request.travel_date))}</strong>
                </div>
                <div>
                    <span>เส้นทาง</span>
                    <strong>${escapeHtml(routeText)}</strong>
                </div>
                <div>
                    <span>ยอดรวม</span>
                    <strong>${formatPrintMoney(request.grand_total)} บาท</strong>
                </div>
                <div>
                    <span>สร้างเอกสาร</span>
                    <strong>${escapeHtml(formatTravelStatusDateTime(request.created_at))}</strong>
                </div>
                <div>
                    <span>อัปเดตล่าสุด</span>
                    <strong>${escapeHtml(formatTravelStatusDateTime(request.updated_at))}</strong>
                </div>
            </div>
        `;
        setTravelStatusLiveTrackingVisible(true, request);
    }

    function renderTravelStatusList(query = '') {
        if (!travelStatusListBody) return;
        const normalizedQuery = String(query || '').trim().toLowerCase();
        const queryId = normalizeTravelRequestId(normalizedQuery);
        const filtered = travelStatusRequests.filter((request) => {
            if (!normalizedQuery) return true;
            const haystack = [
                getTravelRequestNo(request),
                request.id,
                request.traveler_name,
                request.origin_name,
                request.status,
                request.origin_project_code
            ].join(' ').toLowerCase();
            return haystack.includes(normalizedQuery) || (queryId && String(request.id) === queryId);
        });

        if (!filtered.length) {
            travelStatusListBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">ไม่พบเอกสารตามเงื่อนไข</td></tr>';
            return;
        }

        travelStatusListBody.innerHTML = filtered.map((request) => `
            <tr class="${String(request.id) === selectedTravelStatusId ? 'is-selected' : ''}">
                <td><strong>${escapeHtml(getTravelRequestNo(request))}</strong></td>
                <td>${escapeHtml(request.traveler_name || '-')}</td>
                <td>${escapeHtml(formatTravelStatusDate(request.travel_date))}</td>
                <td>${escapeHtml(request.origin_name || '-')}</td>
                <td>${formatPrintMoney(request.grand_total)} บาท</td>
                <td>${renderTravelStatusBadge(request.status)}</td>
                <td>
                    <button type="button" class="btn btn-secondary btn-sm" data-status-request-id="${escapeHtml(request.id)}">
                        <i class="fa-solid fa-eye"></i> ดูสถานะ
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function showTravelStatusDetail(requestId) {
        if (!requestId || !window.TransportApi?.getTravelRequest) return;
        selectedTravelStatusId = String(requestId);
        renderTravelStatusList(travelStatusSearchInput?.value || '');
        if (travelStatusDetail) {
            travelStatusDetail.innerHTML = `
                <div class="travel-status-empty">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    <span>กำลังโหลดสถานะเอกสาร TRV-${escapeHtml(requestId)}...</span>
                </div>
            `;
        }

        try {
            const request = await window.TransportApi.getTravelRequest(requestId);
            renderTravelStatusDetail(request);
        } catch (error) {
            if (travelStatusDetail) {
                travelStatusDetail.innerHTML = `
                    <div class="travel-status-empty is-error">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span>โหลดสถานะเอกสารไม่ได้: ${escapeHtml(error.message || 'ไม่พบข้อมูล')}</span>
                    </div>
                `;
            }
        }
    }

    async function loadTravelStatusRequests(options = {}) {
        if (!travelStatusListBody || !window.TransportApi?.listTravelRequests) return;
        const query = travelStatusSearchInput?.value || '';
        travelStatusListBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">กำลังโหลดรายการเอกสาร...</td></tr>';

        try {
            travelStatusRequests = await window.TransportApi.listTravelRequests();
            renderTravelStatusList(query);

            if (options.selectId) {
                await showTravelStatusDetail(options.selectId);
                return;
            }

            if (options.preserveDetail && selectedTravelStatusId) {
                await showTravelStatusDetail(selectedTravelStatusId);
                return;
            }

            if (!selectedTravelStatusId) renderTravelStatusDetail(null);
        } catch (error) {
            travelStatusListBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-danger);">โหลดรายการเอกสารไม่ได้: ${escapeHtml(error.message || 'เกิดข้อผิดพลาด')}</td></tr>`;
        }
    }

    async function searchTravelStatus() {
        const query = travelStatusSearchInput?.value || '';
        renderTravelStatusList(query);
        const queryId = normalizeTravelRequestId(query);
        if (queryId) {
            await showTravelStatusDetail(queryId);
            return;
        }

        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return;
        const firstMatch = travelStatusRequests.find((request) => [
            request.traveler_name,
            request.origin_name,
            request.origin_project_code
        ].join(' ').toLowerCase().includes(normalizedQuery));
        if (firstMatch) await showTravelStatusDetail(firstMatch.id);
    }

    function renderTravelRequestPreview(request) {
        if (!travelRequestPreviewContent) return;

        const travelers = Array.isArray(request.travelers) ? request.travelers : [];
        const destinations = Array.isArray(request.destinations) ? request.destinations : [];
        const previewFuelQty = Number(request.fuel_qty) || 0;
        const previewFuelPrice = Number(request.fuel_price) || 0;
        const previewFuelTotal = previewFuelQty * previewFuelPrice;
        const previewAccQty = Number(request.acc_qty) || 0;
        const previewAccPrice = Number(request.acc_price) || 0;
        const previewAccTotal = previewAccQty * previewAccPrice;
        const previewGrandTotal = previewFuelTotal + previewAccTotal;
        const canEditAccommodationPrice = request.status === 'hr';
        const travelerRows = travelers.length ? travelers.map((traveler, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(traveler.employee_id || '-')}</td>
                <td>${escapeHtml(traveler.name || '-')}</td>
                <td>${escapeHtml(traveler.department || '-')}</td>
                <td>${escapeHtml(traveler.position || '-')}</td>
                <td>${escapeHtml(traveler.phone || '-')}</td>
            </tr>
        `).join('') : '<tr><td colspan="6" class="text-secondary">ไม่มีข้อมูลผู้เดินทาง</td></tr>';
        const destinationRows = destinations.length ? destinations.map((destination, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(destination.project_code || '-')}</td>
                <td>${escapeHtml(destination.name || '-')}</td>
                <td>${formatPrintMoney(destination.distance)} กม.</td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="text-secondary">ไม่มีข้อมูลปลายทาง</td></tr>';

        travelRequestPreviewContent.innerHTML = `
            <div class="preview-summary-strip">
                <div class="preview-summary-item">
                    <span>เลขเอกสาร</span>
                    <strong>${escapeHtml(getTravelRequestNo(request))}</strong>
                </div>
                <div class="preview-summary-item">
                    <span>สถานะ</span>
                    ${renderTravelStatusBadge(request.status)}
                </div>
                <div class="preview-summary-item">
                    <span>วันที่เดินทาง</span>
                    <strong>${escapeHtml(formatTravelStatusDate(request.travel_date))}</strong>
                </div>
                <div class="preview-summary-item">
                    <span>ยอดรวม</span>
                    <strong id="preview-grand-total">${formatPrintMoney(previewGrandTotal)} บาท</strong>
                </div>
            </div>

            <section class="preview-section">
                <h4><i class="fa-solid fa-route"></i> เส้นทางและค่าใช้จ่าย</h4>
                <div class="preview-field-grid">
                    <div class="preview-field">
                        <span>ต้นทาง</span>
                        <strong>${escapeHtml(request.origin_name || '-')}</strong>
                    </div>
                    <div class="preview-field">
                        <span>รหัสโครงการต้นทาง</span>
                        <strong>${escapeHtml(request.origin_project_code || '-')}</strong>
                    </div>
                    <div class="preview-field">
                        <span>เวลาเดินทาง</span>
                        <strong>${escapeHtml(request.travel_time || '-')}</strong>
                    </div>
                    <div class="preview-field preview-fuel-editor">
                        <span>ค่าน้ำมัน</span>
                        <div class="preview-fuel-type">${escapeHtml(request.fuel_type || '-')}</div>
                        <div class="preview-fuel-calc-row">
                            <label for="preview-fuel-km">ระยะทาง</label>
                            <input type="text" id="preview-fuel-km" inputmode="decimal" value="${escapeHtml(String(previewFuelQty))}">
                            <span>กม. x</span>
                            <strong id="preview-fuel-rate">${formatPrintMoney(previewFuelPrice)} บาท/กม.</strong>
                            <span>=</span>
                            <strong id="preview-fuel-total">${formatPrintMoney(previewFuelTotal)} บาท</strong>
                        </div>
                        <small class="text-secondary">แก้ไข KM แล้วระบบคำนวณยอดใหม่ทันที</small>
                    </div>
                    <div class="preview-field preview-accommodation-editor">
                        <span>ค่าที่พัก</span>
                        <div class="preview-fuel-type">${escapeHtml(request.acc_type || '-')}</div>
                        <div class="preview-accommodation-calc-row">
                            <span>${formatPrintMoney(previewAccQty)} วัน x</span>
                            <label for="preview-acc-price">ราคาค่าห้อง</label>
                            <input type="text" id="preview-acc-price" inputmode="decimal" value="${escapeHtml(String(previewAccPrice))}" ${canEditAccommodationPrice ? '' : 'disabled'}>
                            <span>บาท =</span>
                            <strong id="preview-acc-total">${formatPrintMoney(previewAccTotal)} บาท</strong>
                        </div>
                        <small class="text-secondary">${canEditAccommodationPrice ? 'HR แก้ราคาค่าห้องได้ ระบบคำนวณยอดใหม่ทันที' : 'แก้ราคาค่าห้องได้ในขั้นตรวจสอบโดย HR'}</small>
                        ${canEditAccommodationPrice ? `
                            <div class="preview-cost-save-row">
                                <button type="button" class="btn btn-sm btn-primary" data-save-acc-price-id="${escapeHtml(request.id)}">
                                    <i class="fa-solid fa-floppy-disk"></i> บันทึกราคาค่าห้อง
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <div class="preview-field">
                        <span>อัปเดตล่าสุด</span>
                        <strong>${escapeHtml(formatTravelStatusDateTime(request.updated_at))}</strong>
                    </div>
                </div>
            </section>

            ${renderTravelAttachmentPanel(request, 'preview')}

            <section class="preview-section">
                <h4><i class="fa-solid fa-users"></i> ผู้เดินทาง</h4>
                <table class="preview-mini-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>รหัส</th>
                            <th>ชื่อ</th>
                            <th>แผนก</th>
                            <th>ตำแหน่ง</th>
                            <th>โทร</th>
                        </tr>
                    </thead>
                    <tbody>${travelerRows}</tbody>
                </table>
            </section>

            <section class="preview-section">
                <h4><i class="fa-solid fa-location-dot"></i> ปลายทาง</h4>
                <table class="preview-mini-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>รหัสโครงการ</th>
                            <th>สถานที่</th>
                            <th>ระยะทาง</th>
                        </tr>
                    </thead>
                    <tbody>${destinationRows}</tbody>
                </table>
            </section>
        `;

        travelRequestPreviewContent.querySelector('#preview-fuel-km')?.addEventListener('input', syncPreviewFuelTotals);
        travelRequestPreviewContent.querySelector('#preview-acc-price')?.addEventListener('input', syncPreviewFuelTotals);
        syncPreviewFuelTotals();
    }

    function syncPreviewFuelTotals() {
        if (!previewTravelRequestData) return;

        const kmInput = document.getElementById('preview-fuel-km');
        const fuelTotalEl = document.getElementById('preview-fuel-total');
        const accPriceInput = document.getElementById('preview-acc-price');
        const accTotalEl = document.getElementById('preview-acc-total');
        const grandTotalEl = document.getElementById('preview-grand-total');
        const km = Math.max(Number(kmInput?.value) || 0, 0);
        const price = Number(previewTravelRequestData.fuel_price) || 0;
        const fuelTotal = km * price;
        const accQty = Number(previewTravelRequestData.acc_qty) || 0;
        const accPrice = Math.max(Number(accPriceInput?.value ?? previewTravelRequestData.acc_price) || 0, 0);
        const accTotal = accQty * accPrice;
        const grandTotal = fuelTotal + accTotal;

        previewTravelRequestData = {
            ...previewTravelRequestData,
            fuel_qty: km,
            fuel_total: fuelTotal,
            acc_price: accPrice,
            acc_total: accTotal,
            grand_total: grandTotal
        };

        if (fuelTotalEl) fuelTotalEl.textContent = `${formatPrintMoney(fuelTotal)} บาท`;
        if (accTotalEl) accTotalEl.textContent = `${formatPrintMoney(accTotal)} บาท`;
        if (grandTotalEl) grandTotalEl.textContent = `${formatPrintMoney(grandTotal)} บาท`;
    }

    function closeTravelRequestPreview() {
        if (travelRequestPreviewModal) travelRequestPreviewModal.classList.remove('active');
        previewTravelRequestData = null;
    }

    async function openTravelRequestPreview(requestId) {
        if (!requestId || !travelRequestPreviewModal || !travelRequestPreviewContent) return;
        travelRequestPreviewModal.classList.add('active');
        travelRequestPreviewContent.innerHTML = `
            <div class="travel-status-empty">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span>กำลังโหลดรายละเอียดเอกสาร TRV-${escapeHtml(requestId)}...</span>
            </div>
        `;

        try {
            const request = await window.TransportApi.getTravelRequest(requestId);
            previewTravelRequestData = request;
            renderTravelRequestPreview(request);
        } catch (error) {
            travelRequestPreviewContent.innerHTML = `
                <div class="travel-status-empty is-error">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>โหลดพรีวิวไม่ได้: ${escapeHtml(error.message || 'ไม่พบข้อมูลเอกสาร')}</span>
                </div>
            `;
        }
    }

    function renderTables() {
        // Fetch and Render for each status
        const statuses = ['manager', 'hr', 'md', 'accounting'];
        statuses.forEach(async (status) => {
            try {
                const reqs = await window.TransportApi.listTravelRequests(status);
                
                let bodyEl;
                let nextStatus;
                let btnText;
                
                if (status === 'manager') { bodyEl = managerListBody; nextStatus = 'hr'; btnText = 'อนุมัติ'; }
                else if (status === 'hr') { bodyEl = hrListBody; nextStatus = 'md'; btnText = 'ตรวจสอบผ่าน'; }
                else if (status === 'md') { bodyEl = mdListBody; nextStatus = 'accounting'; btnText = 'อนุมัติ'; }
                else if (status === 'accounting') { bodyEl = accountingListBody; nextStatus = 'completed'; btnText = 'ทำจ่ายเสร็จสิ้น'; }
                
                if (!bodyEl) return;

                if (reqs.length === 0) {
                    bodyEl.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">ไม่มีรายการรอ${status === 'accounting' ? 'ทำจ่าย' : 'อนุมัติ'}</td></tr>`;
                } else {
                    bodyEl.innerHTML = reqs.map(req => `
                        <tr>
                            <td>TRV-${req.id}</td>
                            <td>${req.traveler_name || 'ไม่ระบุ'}</td>
                            <td>${new Date(req.travel_date).toLocaleDateString('th-TH')}</td>
                            <td><span style="color: orange;">รอ${status === 'manager' ? 'หัวหน้า' : status.toUpperCase()}อนุมัติ</span></td>
                            <td>
                                <button type="button" class="btn btn-sm btn-secondary" data-preview-request-id="${escapeHtml(req.id)}">
                                    <i class="fa-solid fa-eye"></i> พรีวิว
                                </button>
                            </td>
                            <td>
                                <div class="approval-actions">
                                    <button type="button" class="btn btn-sm btn-primary" onclick="approveRequest('${req.id}', '${nextStatus}')">
                                        <i class="fa-solid fa-check"></i> ${btnText}
                                    </button>
                                    <button type="button" class="btn btn-sm btn-danger" onclick="rejectRequest('${req.id}')">
                                        <i class="fa-solid fa-xmark"></i> ไม่อนุมัติ
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('');
                }
            } catch (error) {
                console.error(`Error rendering ${status} table:`, error);
            }
        });
    }

    function getCurrentApprovalActor() {
        const session = getLoginSession();
        return {
            approverName: session?.displayName || session?.username || '',
            employeeCode: session?.username || ''
        };
    }

    // Expose globally for inline onclick execution
    window.approveRequest = async function(reqId, nextStatus) {
        try {
            await window.TransportApi.updateTravelRequestStatus(reqId, nextStatus, getCurrentApprovalActor());

            // Sync with local stepper if it's the current request being tracked
            // Note: In this version, we just show a generic alert and refresh tables
            if (nextStatus === 'hr') {
                setStepState(step2, 'completed');
                setStepState(step3, 'active');
                alert(`อนุมัติคำขอ TRV-${reqId} เรียบร้อยแล้ว -> ส่งต่อให้ HR`);
            } else if (nextStatus === 'md') {
                setStepState(step3, 'completed');
                setStepState(step4, 'active');
                alert(`ตรวจสอบคำขอ TRV-${reqId} เรียบร้อยแล้ว -> ส่งต่อให้ MD อนุมัติ`);
            } else if (nextStatus === 'accounting') {
                setStepState(step4, 'completed');
                setStepState(step5, 'active');
                alert(`อนุมัติคำขอ TRV-${reqId} เรียบร้อยแล้ว -> ส่งต่อให้แผนกบัญชีทำจ่าย`);
            } else if (nextStatus === 'completed') {
                setStepState(step5, 'completed');
                alert(`คำขอ TRV-${reqId} ทำจ่ายเสร็จสิ้นสมบูรณ์`);
            }
            
            renderTables();
            loadTravelStatusRequests({ preserveDetail: true });
        } catch (error) {
            alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
            console.error(error);
        }
    };

    window.rejectRequest = async function(reqId) {
        const confirmed = confirm(`ยืนยันไม่อนุมัติเอกสาร TRV-${reqId} ใช่ไหม?`);
        if (!confirmed) return;

        try {
            await window.TransportApi.updateTravelRequestStatus(reqId, 'rejected', getCurrentApprovalActor());
            setStepState(step2, 'rejected');
            setStepState(step3, 'pending');
            setStepState(step4, 'pending');
            setStepState(step5, 'pending');
            alert(`ไม่อนุมัติเอกสาร TRV-${reqId} แล้ว`);

            renderTables();
            loadTravelStatusRequests({ preserveDetail: true });
        } catch (error) {
            alert('เกิดข้อผิดพลาดในการไม่อนุมัติเอกสาร');
            console.error(error);
        }
    };

    // Expose globally for inline onclick execution
    // window.approveRequest and window.rejectRequest are already defined above

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-preview-request-id]');
        if (!button) return;
        openTravelRequestPreview(button.dataset.previewRequestId);
    });

    document.addEventListener('change', async (event) => {
        const input = event.target.closest('[data-travel-attachment-input]');
        if (!input) return;

        const requestId = input.dataset.travelAttachmentInput;
        const files = Array.from(input.files || []);
        const source = input.closest('.travel-attachment-panel-preview') ? 'preview' : 'status';
        try {
            input.disabled = true;
            await uploadTravelRequestAttachments(requestId, files, source);
        } catch (error) {
            alert(`แนบไฟล์ไม่สำเร็จ: ${error.message || 'กรุณาลองใหม่'}`);
        } finally {
            input.value = '';
            input.disabled = false;
        }
    });

    document.addEventListener('click', async (event) => {
        const deleteButton = event.target.closest('[data-delete-travel-attachment-id]');
        if (!deleteButton) return;

        const requestId = deleteButton.dataset.requestId;
        const attachmentId = deleteButton.dataset.deleteTravelAttachmentId;
        if (!requestId || !attachmentId) return;
        const confirmed = confirm('ลบไฟล์แนบนี้ใช่ไหม?');
        if (!confirmed) return;

        try {
            await window.TransportApi.deleteTravelRequestAttachment(requestId, attachmentId);
            const request = await window.TransportApi.getTravelRequest(requestId);
            if (deleteButton.closest('.travel-attachment-panel-preview')) {
                previewTravelRequestData = request;
                renderTravelRequestPreview(request);
            } else {
                selectedTravelStatusRequest = request;
                renderTravelStatusDetail(request);
                await loadTravelStatusRequests({ preserveDetail: true });
            }
        } catch (error) {
            alert(`ลบไฟล์แนบไม่สำเร็จ: ${error.message || 'กรุณาลองใหม่'}`);
        }
    });

    document.addEventListener('click', async (event) => {
        const saveButton = event.target.closest('[data-save-acc-price-id]');
        if (!saveButton || !previewTravelRequestData) return;

        syncPreviewFuelTotals();
        const requestId = saveButton.dataset.saveAccPriceId;
        const originalHtml = saveButton.innerHTML;
        try {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก';
            await window.TransportApi.updateTravelRequestCosts(requestId, {
                accQty: Number(previewTravelRequestData.acc_qty) || 0,
                accPrice: Number(previewTravelRequestData.acc_price) || 0,
                accTotal: Number(previewTravelRequestData.acc_total) || 0,
                grandTotal: Number(previewTravelRequestData.grand_total) || 0,
            });
            const request = await window.TransportApi.getTravelRequest(requestId);
            previewTravelRequestData = request;
            renderTravelRequestPreview(request);
            renderTables();
            await loadTravelStatusRequests({ preserveDetail: true });
        } catch (error) {
            alert(`บันทึกราคาค่าห้องไม่สำเร็จ: ${error.message || 'กรุณาลองใหม่'}`);
            saveButton.disabled = false;
            saveButton.innerHTML = originalHtml;
        }
    });

    if (btnAddTravelPlanAttachment && travelPlanAttachmentInput) {
        btnAddTravelPlanAttachment.addEventListener('click', () => travelPlanAttachmentInput.click());
        travelPlanAttachmentInput.addEventListener('change', async () => {
            const files = Array.from(travelPlanAttachmentInput.files || []);
            try {
                const attachments = await Promise.all(files.map(fileToTravelAttachment));
                pendingTravelPlanAttachments.push(...attachments);
                renderPendingTravelPlanAttachments();
            } catch (error) {
                alert(error.message || 'แนบไฟล์ไม่สำเร็จ');
            } finally {
                travelPlanAttachmentInput.value = '';
            }
        });
    }

    if (travelPlanAttachmentList) {
        travelPlanAttachmentList.addEventListener('click', (event) => {
            const button = event.target.closest('[data-remove-pending-travel-attachment]');
            if (!button) return;
            pendingTravelPlanAttachments.splice(Number(button.dataset.removePendingTravelAttachment), 1);
            renderPendingTravelPlanAttachments();
        });
        renderPendingTravelPlanAttachments();
    }

    [btnCloseTravelPreview, btnCloseTravelPreviewFooter].forEach((button) => {
        if (button) button.addEventListener('click', closeTravelRequestPreview);
    });

    if (travelRequestPreviewModal) {
        travelRequestPreviewModal.addEventListener('click', (event) => {
            if (event.target === travelRequestPreviewModal) closeTravelRequestPreview();
        });
    }

    if (btnPrintTravelPreview) {
        btnPrintTravelPreview.addEventListener('click', () => {
            if (!previewTravelRequestData) {
                alert('ยังไม่มีข้อมูลเอกสารสำหรับปริ้น');
                return;
            }
            printTravelPlanFromData(buildTravelRequestPrintData(previewTravelRequestData));
        });
    }

    if (btnRefreshTravelStatus) {
        btnRefreshTravelStatus.addEventListener('click', () => {
            loadTravelStatusRequests({ preserveDetail: true });
        });
    }

    if (btnTravelStatusSearch) {
        btnTravelStatusSearch.addEventListener('click', searchTravelStatus);
    }

    if (travelStatusSearchInput) {
        travelStatusSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchTravelStatus();
            }
        });
        travelStatusSearchInput.addEventListener('input', () => {
            renderTravelStatusList(travelStatusSearchInput.value);
        });
    }

    if (travelStatusListBody) {
        travelStatusListBody.addEventListener('click', (event) => {
            const button = event.target.closest('[data-status-request-id]');
            if (!button) return;
            showTravelStatusDetail(button.dataset.statusRequestId);
        });
    }

    if (travelStatusDetail) {
        travelStatusDetail.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-print-travel-status-id]');
            if (!button) return;

            const requestId = button.dataset.printTravelStatusId;
            const originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังเตรียม';

            try {
                let request = selectedTravelStatusRequest;
                if (!request || String(request.id) !== String(requestId)) {
                    request = await window.TransportApi.getTravelRequest(requestId);
                    selectedTravelStatusRequest = request;
                }
                printTravelPlanFromData(buildTravelRequestPrintData(request));
            } catch (error) {
                alert(`เตรียมปริ้นเอ้าท์ไม่ได้: ${error.message || 'ไม่พบข้อมูลเอกสาร'}`);
            } finally {
                button.disabled = false;
                button.innerHTML = originalHtml;
            }
        });
    }

    function getInputValue(container, selector, fallback = '') {
        const input = container ? container.querySelector(selector) : null;
        return input ? input.value.trim() : fallback;
    }

    function getInputValueByIndex(container, index, fallback = '') {
        const inputs = container ? container.querySelectorAll('input') : [];
        return inputs[index] ? inputs[index].value.trim() : fallback;
    }

    function parseDisplayNumber(value) {
        const normalized = String(value || '').replace(/[^\d.-]/g, '');
        const number = parseFloat(normalized);
        return Number.isFinite(number) ? number : 0;
    }

    function formatPrintMoney(value) {
        return (Number(value) || 0).toLocaleString('th-TH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function formatPrintDate(value) {
        if (!value) return '-';
        const date = new Date(`${value}T00:00:00`);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function formatPettyCashDate(value, fallbackDate = new Date()) {
        if (!value && !fallbackDate) return '';
        const rawValue = value ? String(value) : '';
        const date = rawValue
            ? (/^\d{4}-\d{2}-\d{2}$/.test(rawValue) ? new Date(`${rawValue}T00:00:00`) : new Date(rawValue))
            : new Date(fallbackDate);
        if (Number.isNaN(date.getTime())) return rawValue || '-';
        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function formatPettyCashPrintTimestamp(date = new Date()) {
        const datePart = date.toLocaleDateString('en-US', {
            month: 'numeric',
            day: 'numeric',
            year: 'numeric'
        });
        const timePart = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        return `${datePart} ${timePart}`;
    }

    function createPettyCashNo(company, date = new Date()) {
        const code = String(company?.code || 'TMS').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'TMS';
        const thaiYearShort = String(date.getFullYear() + 543).slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const sequence = String(((date.getHours() * 3600) + (date.getMinutes() * 60) + date.getSeconds()) % 10000).padStart(4, '0');
        return `MRPCS${code}${thaiYearShort}${month}${day}-${sequence}`;
    }

    function getSelectedOptionText(selectId) {
        const select = document.getElementById(selectId);
        if (!select || select.selectedIndex < 0) return '-';
        return select.options[select.selectedIndex].textContent.trim();
    }

    function collectTravelPlanPrintData() {
        const travelers = Array.from(document.querySelectorAll('#travelers-list .traveler-card')).map(card => ({
            id: getInputValueByIndex(card, 0),
            name: getInputValueByIndex(card, 1),
            department: getInputValueByIndex(card, 2),
            position: getInputValueByIndex(card, 3),
            phone: getInputValueByIndex(card, 4),
            comment: getInputValueByIndex(card, 5)
        }));

        const originCard = document.querySelector('.origin-site');
        const origin = {
            projectCode: getInputValueByIndex(originCard, 0),
            name: getInputValueByIndex(originCard, 1),
            gpsLink: getInputValue(originCard, '.map-link-input')
        };

        const destinations = Array.from(document.querySelectorAll('#destinations-list .dest-site')).map(card => ({
            projectCode: getInputValueByIndex(card, 0),
            name: getInputValueByIndex(card, 1),
            gpsLink: getInputValue(card, '.map-link-input'),
            distance: parseFloat(getInputValue(card, '.distance-input')) || 0
        }));

        const fuelQty = parseFloat(document.getElementById('fuel-qty').value) || 0;
        const fuelPrice = parseFloat(document.getElementById('fuel-price').value) || 0;
        const accQty = parseFloat(document.getElementById('acc-qty').value) || 0;
        const accPrice = parseFloat(document.getElementById('acc-price').value) || 0;
        const jobDescription = getInputValue(formTravelPlan, '#travel-job-description');

        return {
            requestNo: lastTravelRequestNo || 'ยังไม่ส่งอนุมัติ',
            printedAt: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
            date: getInputValue(formTravelPlan, 'input[type="date"]'),
            time: getInputValue(formTravelPlan, 'input[type="time"]'),
            jobDescription,
            travelers,
            origin,
            destinations,
            totalDistance: parseDisplayNumber(document.getElementById('total-distance').textContent),
            fuel: {
                type: document.getElementById('fuel-type').value,
                typeText: getSelectedOptionText('fuel-type'),
                qty: fuelQty,
                price: fuelPrice,
                total: parseDisplayNumber(document.getElementById('fuel-total').textContent)
            },
            accommodation: {
                type: document.getElementById('acc-type').value,
                typeText: getSelectedOptionText('acc-type'),
                qty: accQty,
                price: accPrice,
                total: parseDisplayNumber(document.getElementById('acc-total').textContent)
            },
            grandTotal: parseDisplayNumber(document.getElementById('grand-total').textContent),
            managerApprovedBy: '',
            managerApprovedAt: '',
            mdApprovedBy: '',
            mdApprovedAt: ''
        };
    }

    function normalizePrintDateInput(value) {
        if (!value) return '';
        const directMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
        if (directMatch) return directMatch[1];
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
    }

    function buildTravelRequestPrintData(request) {
        const destinations = Array.isArray(request?.destinations)
            ? request.destinations.map((destination) => ({
                projectCode: destination.project_code || destination.projectCode || '',
                name: destination.name || '',
                gpsLink: destination.gps_link || destination.gpsLink || '',
                distance: Number(destination.distance) || 0
            }))
            : [];
        const travelers = Array.isArray(request?.travelers) && request.travelers.length
            ? request.travelers.map((traveler) => ({
                id: traveler.employee_id || traveler.id || '',
                name: traveler.name || '',
                department: traveler.department || '',
                position: traveler.position || '',
                phone: traveler.phone || '',
                comment: traveler.comment || ''
            }))
            : [{
                id: '',
                name: request?.traveler_name || '',
                department: '',
                position: '',
                phone: '',
                comment: ''
            }];

        return {
            requestNo: getTravelRequestNo(request),
            printedAt: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
            date: normalizePrintDateInput(request?.travel_date),
            time: request?.travel_time || '',
            jobDescription: request?.job_description || request?.jobDescription || '',
            travelers,
            origin: {
                projectCode: request?.origin_project_code || '',
                name: request?.origin_name || '',
                gpsLink: request?.origin_gps_link || ''
            },
            destinations,
            totalDistance: destinations.reduce((sum, destination) => sum + (Number(destination.distance) || 0), 0),
            fuel: {
                type: request?.fuel_type || '',
                typeText: request?.fuel_type || '',
                qty: Number(request?.fuel_qty) || 0,
                price: Number(request?.fuel_price) || 0,
                total: Number(request?.fuel_total) || 0
            },
            accommodation: {
                type: request?.acc_type || '',
                typeText: request?.acc_type || '',
                qty: Number(request?.acc_qty) || 0,
                price: Number(request?.acc_price) || 0,
                total: Number(request?.acc_total) || 0
            },
            grandTotal: Number(request?.grand_total) || 0,
            managerApprovedBy: request?.manager_approved_by || request?.managerApprovedBy || '',
            managerApprovedAt: request?.manager_approved_at || request?.managerApprovedAt || '',
            mdApprovedBy: request?.md_approved_by || request?.mdApprovedBy || '',
            mdApprovedAt: request?.md_approved_at || request?.mdApprovedAt || ''
        };
    }

    function formatWorkingPlanMonth(value, fallbackDate = new Date()) {
        const date = value ? new Date(value) : fallbackDate;
        const safeDate = Number.isNaN(date.getTime()) ? fallbackDate : date;
        const month = safeDate.toLocaleString('en-US', { month: 'long' }).toUpperCase();
        return `${month}, ${safeDate.getFullYear() + 543}`;
    }

    function formatWorkingPlanDate(value, fallbackDate = new Date()) {
        const date = value ? new Date(value) : fallbackDate;
        const safeDate = Number.isNaN(date.getTime()) ? fallbackDate : date;
        return safeDate.toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function renderWorkingPlanPrintPage(data, context = {}) {
        const primaryTraveler = data.travelers[0] || {};
        const now = new Date();
        const reviewedByName = data.managerApprovedBy || '';
        const approvedByName = data.mdApprovedBy || '';
        const workedByName = primaryTraveler.name || '';
        const reviewedDateText = data.managerApprovedAt ? formatWorkingPlanDate(data.managerApprovedAt, now) : '';
        const approvedDateText = data.mdApprovedAt ? formatWorkingPlanDate(data.mdApprovedAt, now) : '';
        const destinationRows = data.destinations.length ? data.destinations : [{
            projectCode: data.origin.projectCode || '',
            name: data.origin.name || '',
            distance: data.totalDistance || 0
        }];
        const fuelCost = Number(data.fuel.total) || 0;
        const accCost = Number(data.accommodation.total) || 0;
        const perRowCost = destinationRows.length ? (fuelCost + accCost) / destinationRows.length : 0;
        const rows = destinationRows.map((destination, index) => {
            const routeText = [
                data.origin.name ? `ต้นทาง: ${data.origin.name}` : '',
                destination.name ? `ปลายทาง: ${destination.name}` : '',
                Number(destination.distance) ? `ระยะทาง ${formatPrintMoney(destination.distance)} กม.` : ''
            ].filter(Boolean).join(' | ');
            const jobDescription = data.jobDescription || routeText || '-';
            return `
                <tr>
                    <td class="working-center">${index === 0 ? escapeHtml(formatWorkingPlanDate(data.date, now)) : ''}</td>
                    <td>${escapeHtml(destination.name || data.origin.name || '-')}</td>
                    <td>${escapeHtml(destination.projectCode || '-')}</td>
                    <td class="working-number">${formatPrintMoney(perRowCost)}</td>
                    <td>${escapeHtml(jobDescription)}</td>
                    <td>${escapeHtml(data.time || '')}</td>
                </tr>
            `;
        }).join('');

        const blankRows = Array.from({ length: Math.max(8 - destinationRows.length, 0) }, () => `
            <tr>
                <td>&nbsp;</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
            </tr>
        `).join('');

        const remark = [
            data.totalDistance ? `ระยะทางรวม ${formatPrintMoney(data.totalDistance)} กม.` : '',
            data.fuel.total ? `ค่าน้ำมัน ${formatPrintMoney(data.fuel.total)} บาท` : '',
            data.accommodation.qty ? `ที่พัก ${formatPrintMoney(data.accommodation.qty)} วัน` : '',
            data.accommodation.total ? `ค่าที่พัก ${formatPrintMoney(data.accommodation.total)} บาท` : '',
            data.requestNo ? `อ้างอิง ${data.requestNo}` : ''
        ].filter(Boolean).join(' | ');

        return `
            <article class="print-page working-plan-page">
                <div class="working-plan-sheet">
                    <header class="working-title-grid">
                        <div class="working-doc-code">F-HR-189&nbsp;&nbsp;REV0</div>
                        <div class="working-title">WORKING PLAN</div>
                        <div class="working-file-name">F-HR-189 Rev0_WORKING PLAN</div>
                    </header>

                    <section class="working-info-grid">
                        <div class="working-info-row"><span>MONTH :</span><strong>${escapeHtml(formatWorkingPlanMonth(data.date, now))}</strong></div>
                        <div class="working-info-row"><span>Person :</span><strong>${escapeHtml(primaryTraveler.name || '-')}</strong></div>
                        <div class="working-info-row"><span>Up Date :</span><strong>${escapeHtml(formatWorkingPlanDate(now, now))}</strong></div>
                        <div class="working-info-row"><span>Position :</span><strong>${escapeHtml(primaryTraveler.position || primaryTraveler.department || '-')}</strong></div>
                    </section>

                    <table class="working-plan-table">
                        <colgroup>
                            <col style="width: 11%;">
                            <col style="width: 22%;">
                            <col style="width: 13%;">
                            <col style="width: 11%;">
                            <col style="width: 33%;">
                            <col style="width: 10%;">
                        </colgroup>
                        <thead>
                            <tr>
                                <th>DATE</th>
                                <th>WORK PLAN</th>
                                <th>Job</th>
                                <th>Cost</th>
                                <th>Job description</th>
                                <th>Actual</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                            ${blankRows}
                        </tbody>
                    </table>

                    <section class="working-remark">
                        <strong>Remark :</strong>
                        <span>${escapeHtml(remark || primaryTraveler.comment || '')}</span>
                    </section>

                    <section class="working-signatures">
                        <div class="working-signature-title">Signatures for process</div>
                        <div class="working-signature-grid">
                            <div>
                                <div class="working-sign-line"></div>
                                <strong>Reviewed by :</strong>
                                <span class="working-sign-name">${escapeHtml(reviewedByName || '-')}</span>
                                <span>Project Manager</span>
                                ${reviewedDateText ? `<span>${escapeHtml(reviewedDateText)}</span>` : ''}
                            </div>
                            <div>
                                <div class="working-sign-line"></div>
                                <strong>Up date Worked</strong>
                                <span class="working-sign-name">${escapeHtml(workedByName || '-')}</span>
                                <span>${escapeHtml(formatWorkingPlanDate(now, now))}</span>
                            </div>
                            <div>
                                <div class="working-sign-line"></div>
                                <strong>Approved by :</strong>
                                <span class="working-sign-name">${escapeHtml(approvedByName || '-')}</span>
                                <span>Project Director</span>
                                ${approvedDateText ? `<span>${escapeHtml(approvedDateText)}</span>` : ''}
                            </div>
                        </div>
                    </section>
                </div>
            </article>
        `;
    }

    function renderTravelPlanPrintout(data) {
        if (!travelPlanPrintout) return;

        const primaryTraveler = data.travelers[0] || {};
        const now = new Date();
        const requestDate = formatPettyCashDate(data.date, now);
        const printDate = formatPettyCashPrintTimestamp(now);
        const company = getActiveCompany();
        const companyName = company.nameEn || company.nameTh || company.code || 'Company';
        const companyLogo = company.logoPath
            ? `<img class="petty-company-logo" src="${escapeHtml(company.logoPath)}" alt="${escapeHtml(companyName)} logo">`
            : `<div class="petty-company-fallback">${escapeHtml(companyName)}</div>`;
        const mrNo = createPettyCashNo(company, now);
        const destinationNames = data.destinations
            .map((destination) => destination.name)
            .filter(Boolean)
            .join(', ');
        const jobNo = [
            data.origin.projectCode,
            data.origin.name || destinationNames
        ].filter(Boolean).join(' ');
        const requiredBy = [
            primaryTraveler.id,
            primaryTraveler.name
        ].filter(Boolean).join(' ');
        const reviewedBy = requiredBy || primaryTraveler.department || '-';
        const managerApprovedBy = data.managerApprovedBy || '';
        const managerApprovedDate = data.managerApprovedAt ? formatPettyCashDate(data.managerApprovedAt, null) : '';
        const mdApprovedBy = data.mdApprovedBy || '';
        const travelRemark = [
            data.origin.name ? `ต้นทาง: ${data.origin.name}` : '',
            destinationNames ? `ปลายทาง: ${destinationNames}` : '',
            data.totalDistance ? `ระยะทางรวม ${formatPrintMoney(data.totalDistance)} กม.` : ''
        ].filter(Boolean).join(' | ');

        const lineItems = [];
        if (data.fuel.qty || data.fuel.price || data.fuel.total) {
            lineItems.push({
                code: data.fuel.type || 'FUEL',
                description: `ค่าน้ำมันรถยนต์ ${data.fuel.typeText || ''}`.trim(),
                spec: data.totalDistance ? `ระยะทาง ${formatPrintMoney(data.totalDistance)} กม.` : '',
                qty: data.fuel.qty,
                unit: 'กม.',
                price: data.fuel.price,
                total: data.fuel.total,
                remark: 'คำนวณจากแผนที่'
            });
        }
        if (data.accommodation.qty || data.accommodation.price || data.accommodation.total) {
            lineItems.push({
                code: 'ACCOM',
                description: `ค่าที่พัก ${data.accommodation.typeText || ''}`.trim(),
                spec: '',
                qty: data.accommodation.qty,
                unit: 'วัน',
                price: data.accommodation.price,
                total: data.accommodation.total,
                remark: ''
            });
        }
        if (!lineItems.length) {
            lineItems.push({
                code: '',
                description: travelRemark || 'ค่าใช้จ่ายในการเดินทาง',
                spec: '',
                qty: 0,
                unit: '',
                price: 0,
                total: 0,
                remark: ''
            });
        }

        const itemRows = lineItems.map((item, index) => `
            <tr>
                <td class="petty-center">${index + 1}</td>
                <td>${escapeHtml(item.code)}</td>
                <td>${escapeHtml(item.description)}</td>
                <td>${escapeHtml(item.spec)}</td>
                <td class="petty-number">${formatPrintMoney(item.qty)}</td>
                <td class="petty-number">0.00</td>
                <td class="petty-center">${escapeHtml(item.unit)}</td>
                <td class="petty-number">${formatPrintMoney(item.price)}</td>
                <td class="petty-number">${formatPrintMoney(item.total)}</td>
                <td>${escapeHtml(item.remark)}</td>
            </tr>
        `).join('');

        const travelerNames = data.travelers
            .map((traveler) => traveler.name)
            .filter(Boolean)
            .join(', ');

        travelPlanPrintout.innerHTML = `
            <article class="print-page petty-cash-page">
                <div class="petty-cash-sheet">
                    <header class="petty-company-row">
                        <div class="petty-logo-cell">${companyLogo}</div>
                        <div class="petty-company-title">${escapeHtml(companyName)}</div>
                        <div class="petty-company-empty"></div>
                    </header>

                    <div class="petty-title-row">PETTY CASH SHEET</div>

                    <section class="petty-info-grid">
                        <div class="petty-info-column">
                            <div class="petty-info-row"><span>Job No</span><b>:</b><div>${escapeHtml(jobNo || '-')}</div></div>
                            <div class="petty-info-row"><span>Sub Code</span><b>:</b><div>${escapeHtml(data.requestNo || '')}</div></div>
                            <div class="petty-info-row"><span>Require By</span><b>:</b><div>${escapeHtml(requiredBy || travelerNames || '-')}</div></div>
                            <div class="petty-info-row"><span>Payment By</span><b>:</b><div>${escapeHtml(managerApprovedBy)}</div></div>
                        </div>
                        <div class="petty-info-column">
                            <div class="petty-info-row"><span>Date</span><b>:</b><div>${escapeHtml(requestDate)}</div></div>
                            <div class="petty-info-row"><span>Bill Status</span><b>:</b><div></div></div>
                            <div class="petty-info-row"><span>Reviewed By</span><b>:</b><div>${escapeHtml(reviewedBy)}</div></div>
                            <div class="petty-info-row"><span>Bank Account</span><b>:</b><div>${escapeHtml(requestDate)}</div></div>
                        </div>
                        <div class="petty-info-column">
                            <div class="petty-info-row"><span>MR No</span><b>:</b><div>${escapeHtml(mrNo)}</div></div>
                            <div class="petty-info-row"><span></span><b></b><div></div></div>
                            <div class="petty-info-row"><span>Reviewed Date</span><b>:</b><div>${escapeHtml(requestDate)}</div></div>
                            <div class="petty-info-row"><span></span><b></b><div></div></div>
                        </div>
                    </section>

                    <table class="petty-table">
                        <colgroup>
                            <col style="width: 4.8%;">
                            <col style="width: 8.8%;">
                            <col style="width: 31%;">
                            <col style="width: 9%;">
                            <col style="width: 8.6%;">
                            <col style="width: 8.6%;">
                            <col style="width: 6.8%;">
                            <col style="width: 7.2%;">
                            <col style="width: 8.8%;">
                            <col style="width: 6.4%;">
                        </colgroup>
                        <thead>
                            <tr>
                                <th rowspan="2">Item</th>
                                <th rowspan="2">Code No</th>
                                <th rowspan="2">Decription</th>
                                <th rowspan="2">Spec Matrial</th>
                                <th colspan="2">Qty</th>
                                <th rowspan="2">Unit</th>
                                <th rowspan="2">Price / Unit</th>
                                <th rowspan="2">Total Price</th>
                                <th rowspan="2">Remark</th>
                            </tr>
                            <tr>
                                <th>Require</th>
                                <th>Approve</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemRows}
                            <tr class="petty-total-row">
                                <td colspan="8">Total</td>
                                <td class="petty-number">${formatPrintMoney(data.grandTotal)}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="petty-blank-area"></div>

                    <footer class="petty-footer-grid">
                        <div class="petty-footer-cell">
                            <div>Comments by reviewed&nbsp;&nbsp;:&nbsp;&nbsp;OK</div>
                            <div>Comments by Payment&nbsp;&nbsp;:&nbsp;&nbsp;${escapeHtml(mdApprovedBy)}</div>
                        </div>
                        <div class="petty-footer-cell">
                            <div>Remark By MD&nbsp;&nbsp;:</div>
                            <p>${escapeHtml(primaryTraveler.comment || travelRemark || 'ค่าวัสดุอุปกรณ์และเครื่องมือ ราคาตาม Vat ได้รับสินค้าแล้วค่ะ')}</p>
                        </div>
                        <div class="petty-footer-cell petty-signature-cell">
                            <div class="petty-signature-row">
                                <div><span>${escapeHtml(managerApprovedBy)}</span><strong>Manager Approval</strong></div>
                                <div><span>${escapeHtml(managerApprovedDate)}</span><strong>Date</strong></div>
                            </div>
                        </div>
                    </footer>

                    <div class="petty-bottom-bar">
                        <div>Print ${escapeHtml(printDate)}</div>
                        <div class="petty-uncontrolled">Uncontrolled IF Print</div>
                        <div>Page&nbsp;&nbsp;&nbsp;&nbsp;1/1</div>
                    </div>
                </div>
            </article>
            ${renderWorkingPlanPrintPage(data)}
        `;
    }

    function printTravelPlanFromData(data) {
        renderTravelPlanPrintout(data);

        if (!travelPlanPrintout || !travelPlanPrintout.innerHTML.trim()) {
            alert('เตรียมหน้าปริ้นเอ้าท์ไม่ได้: ไม่พบข้อมูลเอกสาร');
            return;
        }

        document.body.classList.add('is-printing-travel-plan');
        travelPlanPrintout.setAttribute('aria-hidden', 'false');

        const printImages = Array.from(travelPlanPrintout.querySelectorAll('img'));
        const waitForImages = Promise.all(printImages.map((image) => {
            if (image.complete) return Promise.resolve();
            return new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
            });
        }));

        waitForImages.then(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => window.print());
            });
        });
    }

    window.addEventListener('afterprint', () => {
        document.body.classList.remove('is-printing-travel-plan');
        if (travelPlanPrintout) {
            travelPlanPrintout.setAttribute('aria-hidden', 'true');
        }
    });

    if (btnPrintTravelPlan) {
        btnPrintTravelPlan.addEventListener('click', () => {
            const printData = collectTravelPlanPrintData();
            printTravelPlanFromData(printData);
        });
    }

    formTravelPlan.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Change button to show loading/success
        const originalText = btnSubmitTravelPlan.innerHTML;
        btnSubmitTravelPlan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังส่งขออนุมัติ...';
        btnSubmitTravelPlan.disabled = true;

        try {
            // Collect Data
            const travelers = Array.from(document.querySelectorAll('#travelers-list .traveler-card')).map(card => ({
                id: getInputValueByIndex(card, 0),
                name: getInputValueByIndex(card, 1),
                department: getInputValueByIndex(card, 2),
                position: getInputValueByIndex(card, 3),
                phone: getInputValueByIndex(card, 4),
                comment: getInputValueByIndex(card, 5)
            }));

            const originCard = document.querySelector('.origin-site');
            const origin = {
                projectCode: getInputValueByIndex(originCard, 0),
                name: getInputValueByIndex(originCard, 1),
                gpsLink: getInputValue(originCard, '.map-link-input')
            };

            const destinations = Array.from(document.querySelectorAll('#destinations-list .dest-site')).map(card => ({
                projectCode: getInputValueByIndex(card, 0),
                name: getInputValueByIndex(card, 1),
                gpsLink: getInputValue(card, '.map-link-input'),
                distance: parseFloat(getInputValue(card, '.distance-input')) || 0
            }));

            const dateValue = getInputValue(formTravelPlan, 'input[type="date"]');
            const timeValue = getInputValue(formTravelPlan, 'input[type="time"]');
            const jobDescription = getInputValue(formTravelPlan, '#travel-job-description');

            const fuel = {
                type: document.getElementById('fuel-type').value,
                qty: parseFloat(document.getElementById('fuel-qty').value) || 0,
                price: parseFloat(document.getElementById('fuel-price').value) || 0,
                total: parseFloat(document.getElementById('fuel-total').textContent.replace(/,/g, '')) || 0
            };

            const accommodation = {
                type: document.getElementById('acc-type').value,
                qty: parseFloat(document.getElementById('acc-qty').value) || 0,
                price: parseFloat(document.getElementById('acc-price').value) || 0,
                total: parseFloat(document.getElementById('acc-total').textContent.replace(/,/g, '')) || 0
            };

            const grandTotal = parseFloat(document.getElementById('grand-total').textContent.replace(/,/g, '').replace(' บาท', '')) || 0;

            const actor = getCurrentApprovalActor();
            const result = await window.TransportApi.createTravelRequest({
                travelers,
                origin,
                destinations,
                date: dateValue,
                time: timeValue,
                jobDescription,
                fuel,
                accommodation,
                grandTotal,
                attachments: pendingTravelPlanAttachments,
                createdBy: actor.approverName || actor.employeeCode || ''
            });
            lastTravelRequestNo = result.requestId ? `TRV-${result.requestId}` : lastTravelRequestNo;
            pendingTravelPlanAttachments = [];
            renderPendingTravelPlanAttachments();

            btnSubmitTravelPlan.innerHTML = '<i class="fa-solid fa-check"></i> ส่งขออนุมัติสำเร็จ';
            btnSubmitTravelPlan.classList.replace('btn-primary', 'btn-secondary');
            
            // Re-render tables to show the new request in Manager queue
            renderTables();
            loadTravelStatusRequests({ selectId: result.requestId });
            
            // Show Approval UI in current flow tracking
            approvalStatusSection.style.display = 'block';
            
            // Set Step 1 to completed, Step 2 to active
            setStepState(step1, 'completed');
            setStepState(step2, 'active');
            
            // Scroll to the approval section
            approvalStatusSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            alert(`สร้างแผนการเดินทางเสร็จสิ้น! รหัสอ้างอิง: TRV-${result.requestId}`);

        } catch (error) {
            console.error('Error submitting travel plan:', error);
            alert(`เกิดข้อผิดพลาดในการส่งแผนการเดินทาง: ${error.message || 'กรุณาตรวจสอบข้อมูลอีกครั้ง'}`);
            btnSubmitTravelPlan.innerHTML = originalText;
            btnSubmitTravelPlan.disabled = false;
        }
    });

    // Initial render
    renderTables();
    loadTravelStatusRequests();
    syncMenuPermissionsFromServer();

    // === 8. Load initial admin data ===
    const userListBody = document.getElementById('admin-user-list');
    const carListBody = document.getElementById('admin-car-list');
    let availableCars = [];

    function formatCarOptionLabel(car) {
        const plate = car.license_plate || '-';
        const name = [car.brand, car.model].filter(Boolean).join(' ');
        const source = car.source_database ? ` - ${car.source_database}` : '';
        return `${plate}${name ? ` | ${name}` : ''}${source}`;
    }

    function getCarByPlate(plate) {
        return availableCars.find((car) => car.license_plate === plate) || null;
    }

    function renderArrangeCarOptions() {
        const carSelect = document.getElementById('arrange-car-plate');
        const typeSelect = document.getElementById('arrange-car-type');
        const sourceHint = document.getElementById('arrange-car-source');
        if (!carSelect) return;
        const previousValue = carSelect.value;

        if (!availableCars.length) {
            carSelect.innerHTML = '<option value="">ไม่พบข้อมูลรถในฐานข้อมูล</option>';
            if (sourceHint) sourceHint.textContent = 'ยังไม่พบรถจาก PostgreSQL/MySQL กรุณาตรวจสอบฐานข้อมูลทรัพย์สิน';
            return;
        }

        carSelect.innerHTML = '<option value="">เลือกรถจากฐานข้อมูล</option>' + availableCars.map((car) => `
            <option value="${escapeHtml(car.license_plate || '')}" data-type="${escapeHtml(car.type || '')}">
                ${escapeHtml(formatCarOptionLabel(car))}
            </option>
        `).join('');

        if (previousValue && availableCars.some((car) => car.license_plate === previousValue)) {
            carSelect.value = previousValue;
        }

        if (sourceHint) {
            const sourceSummary = [...new Set(availableCars.map((car) => car.source_database || car.record_source || 'mysql').filter(Boolean))].join(', ');
            sourceHint.textContent = `พบรถ ${availableCars.length} คัน จาก ${sourceSummary || 'MySQL'}`;
        }

        if (typeSelect && carSelect.value) {
            const selectedCar = getCarByPlate(carSelect.value);
            if (selectedCar?.type) typeSelect.value = selectedCar.type;
        }
    }

    function bindArrangeCarSelect() {
        const carSelect = document.getElementById('arrange-car-plate');
        const typeSelect = document.getElementById('arrange-car-type');
        const sourceHint = document.getElementById('arrange-car-source');
        if (!carSelect || carSelect.dataset.bound === '1') return;

        carSelect.dataset.bound = '1';
        carSelect.addEventListener('change', () => {
            const selectedCar = getCarByPlate(carSelect.value);
            if (selectedCar?.type && typeSelect) typeSelect.value = selectedCar.type;
            if (sourceHint && selectedCar) {
                sourceHint.textContent = [
                    selectedCar.asset_code ? `Asset: ${selectedCar.asset_code}` : '',
                    selectedCar.source_database ? `DB: ${selectedCar.source_database}` : '',
                    selectedCar.asset_location ? `สถานที่: ${selectedCar.asset_location}` : '',
                    selectedCar.asset_owner ? `ผู้ดูแล: ${selectedCar.asset_owner}` : ''
                ].filter(Boolean).join(' | ') || 'เลือกจากฐานข้อมูลรถ';
            }
        });
    }
    bindArrangeCarSelect();

    window.loadAdminData = async function() {
        if (!carListBody) return;

        if (userListBody) {
            try {
                const users = await window.TransportApi.listUsers();
                if (users) {
                    if (users.length === 0) {
                        userListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">ไม่มีข้อมูลพนักงาน</td></tr>';
                    } else {
                        userListBody.innerHTML = users.map(u => `
                            <tr>
                                <td>${u.employee_id || '-'}</td>
                                <td>${u.name || '-'}</td>
                                <td>${u.branch || '-'}</td>
                                <td>${u.department || '-'}</td>
                                <td>${u.position || '-'}</td>
                                <td><button class="btn-icon text-danger"><i class="fa-solid fa-trash"></i></button></td>
                            </tr>
                        `).join('');
                    }
                }
            } catch (e) {
                console.error(e);
                userListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-danger);">เกิดข้อผิดพลาดในการดึงข้อมูล</td></tr>';
            }
        }

        // Load Cars
        try {
            const cars = await window.TransportApi.listCars();
            if (cars) {
                availableCars = Array.isArray(cars) ? cars : [];
                bindArrangeCarSelect();
                renderArrangeCarOptions();
                if (availableCars.length === 0) {
                    carListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">ไม่มีข้อมูลรถ</td></tr>';
                } else {
                    carListBody.innerHTML = availableCars.map(c => `
                        <tr>
                            <td>${c.type || '-'}</td>
                            <td>${c.brand || '-'} / ${c.model || c.source_name || '-'}</td>
                            <td>${c.color || '-'}</td>
                            <td>
                                ${c.license_plate || '-'}
                                ${c.source_database ? `<br><small class="text-secondary">${c.source_database}${c.asset_code ? ` | ${c.asset_code}` : ''}</small>` : ''}
                            </td>
                            <td>${c.fuel_type || c.source_database || '-'}</td>
                            <td><button class="btn-icon text-danger"><i class="fa-solid fa-trash"></i></button></td>
                        </tr>
                    `).join('');
                }
            }
        } catch (e) {
            console.error(e);
            carListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-danger);">เกิดข้อผิดพลาดในการดึงข้อมูล</td></tr>';
        }
    }
    
    // Initial fetch
    if(userListBody && carListBody) {
        window.loadAdminData();
    }

    // === 9. New Car Booking Flow Logic ===
    let carBookings = [];
    let carBookingCounter = 1000;
    
    // Elements for Arrangement
    const carArrangementListView = document.getElementById('car-arrangement-list-view');
    const formCarArrangement = document.getElementById('form-car-arrangement');
    const arrangementListBody = document.getElementById('car-arrangement-list-body');
    const btnBackArrangement = document.getElementById('btn-back-arrangement');
    
    // Elements for Packing
    const packingListView = document.getElementById('packing-list-view');
    const packingSimulatorView = document.getElementById('packing-simulator-view');
    const packingListBodyTable = document.getElementById('packing-list-main-body');
    const btnBackPacking = document.getElementById('btn-back-packing');
    
    let currentArrangeBookingId = null;
    let currentPackBookingId = null;

    // --- CAR BOOKING FORM SUBMIT ---
    const formCarBooking = document.getElementById('form-car-booking');
    if (formCarBooking) {
        formCarBooking.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = formCarBooking.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
            submitBtn.disabled = true;

            const documentType = document.getElementById('booking-type-select').value;
            const isDeliveryDocument = documentType === 'f175' || documentType === 'f60';
            const type = isDeliveryDocument ? 'delivery' : 'admin';
            let deliveryNote = null;
            let deliveryPackingList = [];

            try {
                if (isDeliveryDocument) {
                    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังสร้างใบส่งของ...';
                    deliveryNote = await window.TransportApi.createDeliveryNote(buildDeliveryNotePayload());
                    deliveryPackingList = deliveryNoteItems.map((item) => ({
                        name: item.name,
                        qty: item.qty,
                        weight: item.totalWeightKg,
                        dim: item.dim,
                        sku: item.sku,
                        unit: item.unit
                    }));
                }
            } catch (error) {
                alert(`สร้างใบส่งของไม่ได้: ${error.message}`);
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                return;
            }

            setTimeout(() => {
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> ยืนยันสำเร็จ!';
                submitBtn.style.background = '#10b981';
                let detail = '';
                let dest = '';
                
                if (type === 'admin') {
                    const adminReq = document.querySelector('.admin-req');
                    detail = adminReq && adminReq.value ? adminReq.value : '-';
                    dest = 'ตามมอบหมาย';
                } else {
                    detail = documentType.toUpperCase() + ' (ใบส่งของ: ' + (deliveryNote ? deliveryNote.note_no : '-') + ')';
                    dest = deliveryNote && deliveryNote.destination_name ? deliveryNote.destination_name : 'หลายปลายทาง';
                }
                
                const newBooking = {
                    id: 'CB-' + (++carBookingCounter),
                    type: type,
                    documentType: documentType,
                    detail: detail,
                    destination: dest,
                    status: 'pending_arrangement',
                    deliveryNote: deliveryNote,
                    packingList: deliveryPackingList,
                    arrangedCar: null
                };
                
                carBookings.push(newBooking);
                renderCarArrangementTable();
                
                alert('จองรถเรียบร้อย! คำขอถูกส่งไปยังแผนกจัดรถแล้ว (รหัส ' + newBooking.id + ')');
                
                setTimeout(() => {
                    submitBtn.innerHTML = originalText;
                    submitBtn.style.background = '';
                    submitBtn.disabled = false;
                    formCarBooking.reset();
                    resetDeliveryNoteBuilder();
                    if (bookingTypeSelect) {
                        bookingTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, 2000);
            }, 1000);
        });
    }

    // --- CAR ARRANGEMENT LOGIC ---
    let carArrangements = [];
    let arrangementCounter = 1000;
    let currentArrangeBookingIds = [];

    const btnArrangeSelected = document.getElementById('btn-arrange-selected');
    const checkAllArrangements = document.getElementById('check-all-arrangements');

    function updateArrangeSelectionButtons() {
        const checkboxes = document.querySelectorAll('.arrange-checkbox');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        if (btnArrangeSelected) {
            btnArrangeSelected.disabled = checkedCount === 0;
            btnArrangeSelected.innerHTML = `<i class="fa-solid fa-truck-fast"></i> จัดรวบยอดที่เลือก (${checkedCount})`;
        }
        if (checkAllArrangements) {
            checkAllArrangements.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
        }
    }

    if (checkAllArrangements) {
        checkAllArrangements.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.arrange-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateArrangeSelectionButtons();
        });
    }

    if (btnArrangeSelected) {
        btnArrangeSelected.addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.arrange-checkbox:checked')).map(cb => cb.value);
            if(selectedIds.length > 0) openArrangeForm(selectedIds);
        });
    }

    // Make render global to call from inline onclick
    function renderCarBookingTypeBadge(req) {
        if (req.documentType === 'f175') {
            return '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; padding: 4px 8px; border-radius: 4px;">F175</span>';
        }
        if (req.documentType === 'f60') {
            return '<span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #8b5cf6; padding: 4px 8px; border-radius: 4px;">F60</span>';
        }
        return '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 8px; border-radius: 4px;">จองรถทั่วไป</span>';
    }

    window.renderCarArrangementTable = function() {
        if (!arrangementListBody) return;
        const pendingReqs = carBookings.filter(b => b.status === 'pending_arrangement');
        
        if (pendingReqs.length === 0) {
            arrangementListBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-secondary);">ไม่มีรายการรอจัดรถ</td></tr>';
        } else {
            arrangementListBody.innerHTML = pendingReqs.map(req => `
                <tr>
                    <td><input type="checkbox" class="arrange-checkbox" value="${req.id}" onchange="updateArrangeSelectionButtons()"></td>
                    <td>${req.id}</td>
                    <td>${renderCarBookingTypeBadge(req)}</td>
                    <td>${req.detail} <br> <small class="text-secondary"><i class="fa-solid fa-location-dot"></i> ${req.destination}</small></td>
                    <td><span style="color: orange;">รอรับเรื่อง / จัดรถ</span></td>
                    <td><button class="btn btn-sm btn-primary" onclick="openArrangeForm(['${req.id}'])"><i class="fa-solid fa-truck-fast"></i> จัดรถใช้งาน</button></td>
                </tr>
            `).join('');
        }
        updateArrangeSelectionButtons();
    };
    
    // Attach it globally so the inline html `onchange` can find it
    window.updateArrangeSelectionButtons = updateArrangeSelectionButtons;

    window.openArrangeForm = function(ids) {
        currentArrangeBookingIds = ids;
        document.getElementById('arrange-booking-ids').textContent = ids.join(', ');
        bindArrangeCarSelect();
        renderArrangeCarOptions();
        if (!availableCars.length && window.loadAdminData) {
            window.loadAdminData();
        }
        carArrangementListView.style.display = 'none';
        formCarArrangement.style.display = 'flex';
    };
    
    if (btnBackArrangement) {
        btnBackArrangement.addEventListener('click', () => {
            formCarArrangement.style.display = 'none';
            carArrangementListView.style.display = 'block';
            currentArrangeBookingIds = [];
        });
    }
    
    if (formCarArrangement) {
        formCarArrangement.addEventListener('submit', (e) => {
            e.preventDefault();
            if (currentArrangeBookingIds.length === 0) return;
            
            const submitBtn = formCarArrangement.querySelector('button[type="submit"]');
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> กำลังบันทึก...';
            submitBtn.disabled = true;
            
            setTimeout(() => {
                const selectedPlate = document.getElementById('arrange-car-plate').value;
                const selectedCar = getCarByPlate(selectedPlate);
                const arrangedCarDetails = {
                    type: document.getElementById('arrange-car-type').value,
                    plate: selectedPlate,
                    assetCode: selectedCar?.asset_code || null,
                    sourceDatabase: selectedCar?.source_database || null
                };

                const hasDelivery = currentArrangeBookingIds.some(id => {
                    const b = carBookings.find(x => x.id === id);
                    return b && b.type === 'delivery';
                });

                const items = currentArrangeBookingIds.flatMap((id) => {
                    const booking = carBookings.find((item) => item.id === id);
                    return booking && Array.isArray(booking.packingList) ? booking.packingList : [];
                });
                const attachedFileName = currentArrangeBookingIds.map((id) => {
                    const booking = carBookings.find((item) => item.id === id);
                    return booking && booking.deliveryNote ? booking.deliveryNote.note_no : '';
                }).filter(Boolean).join(', ');

                // Combine destinations roughly for display
                const allDestinations = currentArrangeBookingIds.map(id => {
                    const b = carBookings.find(x => x.id === id);
                    return b ? b.destination : '';
                }).filter((value, index, self) => value && value !== 'ตามมอบหมาย' && self.indexOf(value) === index).join(' และ ');

                // Create Arrangement
                const newArrangement = {
                    id: 'AR-' + (++arrangementCounter),
                    bookingIds: currentArrangeBookingIds,
                    destination: allDestinations || 'ตามมอบหมาย',
                    arrangedCar: arrangedCarDetails,
                    packingList: items,
                    attachedFile: attachedFileName,
                    status: hasDelivery ? 'pending_packing' : 'completed'
                };
                
                carArrangements.push(newArrangement);

                // Update linked bookings
                currentArrangeBookingIds.forEach(id => {
                    const b = carBookings.find(x => x.id === id);
                    if (b) b.status = 'arranged'; // so they disappear from waiting list
                });

                if (hasDelivery) {
                    alert(`จัดรถรวบยอดเรียบร้อย! งานนี้ถูกสร้างเป็นเลขจัดรถ ${newArrangement.id} และส่งไปยังแผนก "จัดของ" แล้ว`);
                } else {
                    alert(`จัดรถเรียบร้อย! เลขทำรายการ ${newArrangement.id} สำหรับงานธุระการ พร้อมเดินทางไม่ต้องจัดของ`);
                }
                
                formCarArrangement.style.display = 'none';
                carArrangementListView.style.display = 'block';
                currentArrangeBookingIds = [];
                if (checkAllArrangements) checkAllArrangements.checked = false;
                formCarArrangement.reset();
                submitBtn.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> ยืนยันการจัดรถ';
                submitBtn.disabled = false;
                
                renderCarArrangementTable();
                renderPackingTable();
            }, 800);
        });
    }

    // --- PACKING LOGIC (DRAG & DROP) ---
    window.renderPackingTable = function() {
        if (!packingListBodyTable) return;
        const pendingPackings = carArrangements.filter(a => a.status === 'pending_packing');
        
        if (pendingPackings.length === 0) {
            packingListBodyTable.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-secondary);">ไม่มีรายการรอจัดของ</td></tr>';
        } else {
            packingListBodyTable.innerHTML = pendingPackings.map(req => `
                <tr>
                    <td>${req.id} <br><small class="text-secondary">รหัสใบจอง: ${req.bookingIds.join(', ')}</small></td>
                    <td><span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 8px; border-radius: 4px;">${req.arrangedCar.plate}</span><br><small class="text-secondary">${req.arrangedCar.type}</small></td>
                    <td><i class="fa-solid fa-location-dot text-accent"></i> ${req.destination} ${req.attachedFile ? `<br><small style="color: #3b82f6;"><i class="fa-solid fa-paperclip"></i> ${req.attachedFile}</small>` : ''}</td>
                    <td><span style="color: yellow;">รอตียอดจัดของขึ้นรถ</span></td>
                    <td><button class="btn btn-sm btn-primary" onclick="openPackingSimulator('${req.id}')"><i class="fa-solid fa-box-open"></i> จัดแบบจำลอง</button></td>
                </tr>
            `).join('');
        }
    };
    
    window.openPackingSimulator = function(id) {
        currentPackBookingId = id;
        document.getElementById('pack-booking-id').textContent = id;
        packingListView.style.display = 'none';
        packingSimulatorView.style.display = 'block';
        
        const arrangement = carArrangements.find(a => a.id === id);
        if (!arrangement) return;
        
        // Setup Vehicle Info
        const carTypeMap = { 'sedan': 'รถเก๋ง', 'pickup': 'รถกระบะ', 'van': 'รถตู้', 'truck': 'รถบรรทุก' };
        const displayType = carTypeMap[arrangement.arrangedCar.type] || arrangement.arrangedCar.type;
        document.getElementById('cargo-vehicle-info').textContent = displayType + ' (' + arrangement.arrangedCar.plate + ')';
        
        // Modify cargo zone size slightly based on car type for realism
        const dropZone = document.getElementById('cargo-drop-zone');
        if(arrangement.arrangedCar.type === 'pickup') {
            dropZone.style.width = '70%'; 
            dropZone.style.height = '280px';
        } else if(arrangement.arrangedCar.type === 'van') {
            dropZone.style.width = '90%'; 
            dropZone.style.height = '320px';
        } else {
            dropZone.style.width = '80%'; 
            dropZone.style.height = '250px';
        }
        
        // Generate Draggable Items
        const container = document.getElementById('draggable-items-container');
        container.innerHTML = '';
        
        let itemIdCounter = 1;
        arrangement.packingList.forEach(item => {
            // If qty > 1, create multiple boxes for simulation
            const numBoxes = Math.min(item.qty, 10); // cap to 10 for performance in sim
            for(let i=0; i<numBoxes; i++) {
                const el = document.createElement('div');
                el.className = 'draggable-item';
                el.id = 'cargo-item-' + itemIdCounter++;
                el.setAttribute('draggable', 'true');
                el.innerHTML = '<i class="fa-solid fa-box mr-2"></i> ' + item.name + (numBoxes > 1 ? ` (${i+1}/${item.qty})` : '');
                
                // Parse dimensions roughly if present
                let boxW = 80, boxH = 80;
                if (item.dim !== 'ไม่ระบุ') {
                    const parts = item.dim.split(/x|\*/i).map(s=>parseInt(s));
                    if(parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        boxW = Math.max(50, parts[0] * 1.5);
                        boxH = Math.max(50, parts[1] * 1.5);
                    }
                }
                
                // Add base attributes to hold size
                el.dataset.origW = boxW;
                el.dataset.origH = boxH;
                
                // Initial styling for list view vs simulator view
                el.style.width = '100%';
                el.style.height = 'auto'; 
                
                initDragAndDrop(el, dropZone, container);
                container.appendChild(el);
            }
        });
    };
    
    // Simple Drag & Drop implementation
    function initDragAndDrop(el, dropZone, listContainer) {
        el.addEventListener('dragstart', (e) => {
            el.classList.add('is-dragging');
            e.dataTransfer.setData('text/plain', el.id);
            const rect = el.getBoundingClientRect();
            e.dataTransfer.setData('offsetX', e.clientX - rect.left);
            e.dataTransfer.setData('offsetY', e.clientY - rect.top);
        });
        
        el.addEventListener('dragend', () => {
            el.classList.remove('is-dragging');
        });
        
        dropZone.addEventListener('dragover', (e) => e.preventDefault());
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            const dragged = document.getElementById(id);
            if (dragged) {
                if (dragged.parentElement === listContainer) {
                    dropZone.appendChild(dragged);
                    dragged.classList.add('packed');
                    dragged.style.width = dragged.dataset.origW + 'px';
                    dragged.style.height = dragged.dataset.origH + 'px';
                }
                
                const zoneRect = dropZone.getBoundingClientRect();
                const offsetX = parseFloat(e.dataTransfer.getData('offsetX')) || 0;
                const offsetY = parseFloat(e.dataTransfer.getData('offsetY')) || 0;
                
                let newX = e.clientX - zoneRect.left - offsetX;
                let newY = e.clientY - zoneRect.top - offsetY;
                
                // Boundary check
                newX = Math.max(0, Math.min(newX, dropZone.clientWidth - dragged.offsetWidth));
                newY = Math.max(0, Math.min(newY, dropZone.clientHeight - dragged.offsetHeight));
                
                dragged.style.left = newX + 'px';
                dragged.style.top = newY + 'px';
            }
        });
        
        listContainer.addEventListener('dragover', (e) => e.preventDefault());
        listContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            const dragged = document.getElementById(id);
            if(dragged && dragged.parentElement === dropZone) {
                dragged.classList.remove('packed');
                dragged.style.position = 'relative';
                dragged.style.left = 'auto';
                dragged.style.top = 'auto';
                dragged.style.width = '100%';
                dragged.style.height = 'auto';
                listContainer.appendChild(dragged);
            }
        });
    }
    
    if (btnBackPacking) {
        btnBackPacking.addEventListener('click', () => {
            packingSimulatorView.style.display = 'none';
            packingListView.style.display = 'block';
            currentPackBookingId = null;
        });
    }
    
    const btnConfirmPacking = document.getElementById('btn-confirm-packing');
    if (btnConfirmPacking) {
        btnConfirmPacking.addEventListener('click', () => {
            const container = document.getElementById('draggable-items-container');
            if (container.children.length > 0) {
                if (!confirm('มีสินค้ายังไม่ได้จัดขึ้นรถระวาง คุณต้องการยืนยันการจัดของเสร็จสิ้นหรือไม่?')) {
                    return;
                }
            }
            
            const arrangement = carArrangements.find(a => a.id === currentPackBookingId);
            if (arrangement) {
                arrangement.status = 'completed';
                alert(`✅ การแพ็คของและการจัดเลย์เอาต์ท้ายรถเสร็จสมบูรณ์! เลขที่จัดรถ ${arrangement.id} พร้อมออกเดินทาง`);
                
                packingSimulatorView.style.display = 'none';
                packingListView.style.display = 'block';
                currentPackBookingId = null;
                
                renderPackingTable();
            }
        });
    }

    // === 10. Dashboard Logic ===
    const mockActiveVehicles = [
        { vid: 'CB-001', plate: 'AB-1234', type: 'รถบรรทุก 6 ล้อ', driver: 'สมชาย ใจดี', driverPhone: '081-111-1111', requester: 'John Doe', reqDept: 'IT', origin: 'สำนักงานใหญ่', dest: 'ชลบุรี', destCoords: [13.3611, 100.9847], status: 'กำลังเดินทาง', statusColor: 'blue', progress: 45, detail: 'ส่งมอบอุปกรณ์ Server' },
        { vid: 'CB-002', plate: 'XY-9999', type: 'รถกระบะ', driver: 'สมหมาย สบายใจ', driverPhone: '082-222-2222', requester: 'Jane Doe', reqDept: 'HR', origin: 'โกดัง A', dest: 'ระยอง', destCoords: [12.6831, 101.2816], status: 'เตรียมเดินทาง', statusColor: 'yellow', progress: 10, detail: 'รับเอกสารสำคัญ' },
        { vid: 'CB-003', plate: 'ZZ-0000', type: 'รถตู้ทึบ', driver: 'อนันต์ ทันใจ', driverPhone: '083-333-3333', requester: 'Admin Team', reqDept: 'Admin', origin: 'สำนักงานใหญ่', dest: 'เชียงใหม่', destCoords: [18.7883, 98.9853], status: 'กำลังพัก', statusColor: 'purple', progress: 70, detail: 'ส่งสินค้าคลังภูมิภาค' }
    ];

    window.copyTrackingLink = function(vid, plate) {
        const url = `${window.location.origin}/driver-tracker.html?vid=${vid}&plate=${encodeURIComponent(plate)}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('คัดลอกลิ้งค์สำหรับคนขับเรียบร้อยแล้ว:\\n' + url);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            prompt('กรุณาคัดลอกลิ้งค์นี้แทน:', url);
        });
    };

    let dashboardMap;
    let vehicleMarkers = {};

    function initDashboardLiveMap() {
        try {
            const mapContainer = document.getElementById('dashboard-live-map');
            if (!mapContainer || dashboardMap) return;
            
            if (typeof L === 'undefined') {
                console.error('Leaflet is not loaded!');
                mapContainer.innerHTML = '<div style="padding:20px; color:#ef4444;">Error: Leaflet library not found.</div>';
                return;
            }

        // Center on Thailand with Fullscreen enabled
        dashboardMap = L.map('dashboard-live-map', {
            center: [13.736717, 100.523186],
            zoom: 6,
            fullscreenControl: true,
            fullscreenControlOptions: {
                position: 'topleft',
                title: 'เต็มจอ',
                titleCancel: 'ออกจากโหมดเต็มจอ'
            }
        });
        
        // -- Define Map Layers --
        const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            subdomains: 'abcd',
            maxZoom: 19
        });
        
        const googleStreets = L.tileLayer('https://{s}.google.com/vt?lyrs=m&x={x}&y={y}&z={z}', {
            attribution: 'Map data &copy; Google',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });
        
        const googleSatellite = L.tileLayer('https://{s}.google.com/vt?lyrs=s,h&x={x}&y={y}&z={z}', {
            attribution: 'Map data &copy; Google',
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
        });

        // Add default layer (Google Maps with POIs)
        googleStreets.addTo(dashboardMap);

        // Add Layer Control to let user switch maps
        const baseMaps = {
            "Google แผนที่ปกติ (ค่าเริ่มต้น)": googleStreets,
            "Google ดาวเทียม + สถานที่": googleSatellite,
            "ธีมมืด (Dark Mode)": darkMap
        };

        L.control.layers(baseMaps, null, {position: 'topright'}).addTo(dashboardMap);

        // Add Search Box (Geocoder)
        L.Control.geocoder({
            defaultMarkGeocode: false,
            placeholder: "ค้นหาสถานที่ตั้ง..."
        }).on('markgeocode', function(e) {
            const bbox = e.geocode.bbox;
            const poly = L.polygon([
                bbox.getSouthEast(),
                bbox.getNorthEast(),
                bbox.getNorthWest(),
                bbox.getSouthWest()
            ]).addTo(dashboardMap);
            dashboardMap.fitBounds(poly.getBounds());
            
            // Show a popup with the location name
            L.popup()
                .setLatLng(e.geocode.center)
                .setContent(`<strong style="color:#000;">${e.geocode.name}</strong>`)
                .openOn(dashboardMap);

            setTimeout(() => dashboardMap.removeLayer(poly), 3000);
        }).addTo(dashboardMap);

        // Add Locate Control (Find Me)
        L.control.locate({
            position: 'topleft',
            strings: { title: "แสดงตำแหน่งของฉัน" },
            icon: 'fa-solid fa-location-crosshairs'
        }).addTo(dashboardMap);

        // Add markers for active vehicles
        let vehicleRoutes = {};
        
        mockActiveVehicles.forEach((v) => {
            const lat = 13.736717 + (Math.random() - 0.5) * 5; // spread around Thailand
            const lng = 100.523186 + (Math.random() - 0.5) * 5;
            
            const colorHex = v.statusColor === 'blue' ? '#3b82f6' : v.statusColor === 'yellow' ? '#f59e0b' : '#8b5cf6';
            const icon = L.divIcon({
                className: 'custom-vehicle-marker',
                html: `<div style="background-color: ${colorHex}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 12px ${colorHex};"></div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([lat, lng], {icon: icon})
                .addTo(dashboardMap)
                .bindPopup(`<strong style="color: #1f2937;">${v.plate}</strong><br><span style="color: ${colorHex}; font-weight: bold;">${v.status}</span><br><small style="color: #6b7280;">ผู้ขับ: ${v.driver}</small><br><br><a href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}" target="_blank" style="display:inline-block; padding: 4px 8px; background: #3b82f6; color: white; border-radius: 4px; text-decoration: none; font-size: 12px; margin-top: 5px;"><i class="fa-solid fa-map-location-dot"></i> นำทางผ่าน Google Maps</a>`);
            
            vehicleMarkers[v.vid] = marker;

            // Draw Route Line
            if (v.destCoords && typeof L.Routing !== 'undefined') {
                vehicleRoutes[v.vid] = L.Routing.control({
                    waypoints: [
                        L.latLng(lat, lng), // Start
                        L.latLng(v.destCoords[0], v.destCoords[1]) // End
                    ],
                    routeWhileDragging: false,
                    show: false, // hide the text itinerary panel
                    addWaypoints: false,
                    fitSelectedRoutes: false,
                    lineOptions: {
                        styles: [{color: colorHex, opacity: 0.7, weight: 4}]
                    },
                    createMarker: function(i, wp) {
                        if (i === 1) { // Only destination marker
                            return L.marker(wp.latLng, {
                                icon: L.divIcon({
                                    className: 'custom-dest-marker',
                                    html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px #ef4444;"></div>`,
                                    iconSize: [18, 18],
                                    iconAnchor: [9, 9]
                                })
                            }).bindPopup('<b>ปลายทาง:</b> ' + v.dest);
                        }
                        return null; // Don't create start marker (we already have truck icon)
                    }
                }).addTo(dashboardMap);
            }
        });

        // Initial invalidateSize to fix sizing issues if container not fully ready
        setTimeout(() => {
            if (dashboardMap) dashboardMap.invalidateSize();
        }, 800);

        // Fetch Live GPS or Simulate if unavailable
        setInterval(async () => {
            try {
                const liveData = await window.TransportApi.listGps();
                
                for (let vid in vehicleMarkers) {
                    const marker = vehicleMarkers[vid];
                    let currentPos = marker.getLatLng();
                    let newLat = currentPos.lat;
                    let newLng = currentPos.lng;
                    let updated = false;

                    if (liveData && liveData[vid]) {
                        // Use real GPS coordinates
                        newLat = liveData[vid].lat;
                        newLng = liveData[vid].lng;
                        updated = true;
                    } else {
                        // Fallback: Simulate slight drift towards destination
                        const vData = mockActiveVehicles.find(mv => mv.vid === vid);
                        if (vData && vData.destCoords) {
                            // move slighly towards dest
                            const destLat = vData.destCoords[0];
                            const destLng = vData.destCoords[1];
                            newLat += (destLat - newLat) * 0.005;
                            newLng += (destLng - newLng) * 0.005;
                            updated = true;
                        } else {
                            newLat += (Math.random() - 0.5) * 0.002;
                            newLng += (Math.random() - 0.5) * 0.002;
                            updated = true;
                        }
                    }

                    if (updated) {
                        marker.setLatLng([newLat, newLng]);
                        
                        // Update popup with new coordinates
                        const vData = mockActiveVehicles.find(mv => mv.vid === vid);
                        if (vData) {
                            const cHex = vData.statusColor === 'blue' ? '#3b82f6' : vData.statusColor === 'yellow' ? '#f59e0b' : '#8b5cf6';
                            marker.setPopupContent(`<strong style="color: #1f2937;">${vData.plate}</strong><br><span style="color: ${cHex}; font-weight: bold;">${vData.status}</span><br><small style="color: #6b7280;">ผู้ขับ: ${vData.driver}</small><br><br><a href="https://www.google.com/maps/dir/?api=1&destination=${newLat},${newLng}" target="_blank" style="display:inline-block; padding: 4px 8px; background: #3b82f6; color: white; border-radius: 4px; text-decoration: none; font-size: 12px; margin-top: 5px;"><i class="fa-solid fa-map-location-dot"></i> นำทางผ่าน Google Maps</a>`);
                        }

                        // Optionally update the starting point of the route line
                        if (vehicleRoutes[vid] && Math.random() < 0.1) {
                            const vData = mockActiveVehicles.find(mv => mv.vid === vid);
                            if (vData && vData.destCoords) {
                                vehicleRoutes[vid].setWaypoints([
                                    L.latLng(newLat, newLng),
                                    L.latLng(vData.destCoords[0], vData.destCoords[1])
                                ]);
                            }
                        }
                    }
                }
            } catch(e) {
                console.error('Failed to fetch GPS:', e);
            }
        }, 3000);
        } catch (err) {
            console.error('CRITICAL: Failed to initialize Dashboard Map:', err);
        }
    }

    function initDashboard() {
        initDashboardLiveMap();

        // Render Vehicle Table
        const tbody = document.getElementById('dashboard-vehicles-table');
        if (tbody) {
            tbody.innerHTML = mockActiveVehicles.map(v => `
                <tr class="clickable-item" data-vid="${v.vid}">
                    <td>
                        <strong>${v.plate}</strong>
                        <button onclick="event.stopPropagation(); copyTrackingLink('${v.vid}', '${v.plate}')" title="คัดลอกลิ้งค์ส่งให้คนขับ" style="background: none; border: none; color: var(--accent-primary); cursor: pointer; float: right;"><i class="fa-solid fa-link"></i></button>
                        <br><small class="text-secondary">${v.type}</small>
                    </td>
                    <td>${v.driver}<br><small class="text-secondary"><i class="fa-solid fa-phone"></i> ${v.driverPhone}</small></td>
                    <td>${v.requester}<br><small class="text-secondary">${v.reqDept}</small></td>
                    <td>${v.origin} <i class="fa-solid fa-arrow-right text-muted mx-1"></i> ${v.dest}</td>
                    <td><span class="badge" style="background: rgba(${v.statusColor === 'blue' ? '59,130,246' : v.statusColor === 'yellow' ? '245,158,11' : '139,92,246'}, 0.2); color: ${v.statusColor === 'blue' ? '#3b82f6' : v.statusColor === 'yellow' ? '#f59e0b' : '#8b5cf6'}; padding: 4px 8px; border-radius: 4px;">${v.status}</span></td>
                </tr>
            `).join('');
        }

        // Add Double Click Listeners for Popup Modal
        const modal = document.getElementById('vehicle-detail-modal');
        const modalContent = document.getElementById('vehicle-detail-content');
        const btnCloseModal = document.getElementById('btn-close-vehicle-modal');
        
        if (btnCloseModal && modal) {
            btnCloseModal.addEventListener('click', () => modal.style.display = 'none');
        }
        
        // Double click on Table rows OR Map Pins
        document.querySelectorAll('.clickable-item').forEach(item => {
            item.addEventListener('dblclick', function() {
                const vid = this.getAttribute('data-vid');
                if (!vid || !modalContent || !modal) return;
                
                const vehicle = mockActiveVehicles.find(v => v.vid === vid);
                if (vehicle) {
                    modalContent.innerHTML = `
                        <div style="margin-bottom: 1.5rem; text-align: center;">
                            <div style="width: 80px; height: 80px; border-radius: 50%; background: #1f2937; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: var(--accent-primary); margin: 0 auto 10px; border: 2px solid rgba(255,255,255,0.1);">
                                <i class="fa-solid ${vehicle.type.includes('บรรทุก') ? 'fa-truck' : 'fa-car'}"></i>
                            </div>
                            <h2 style="margin:0; color:#fff;">${vehicle.plate}</h2>
                            <p class="text-secondary" style="margin:5px 0 0;">${vehicle.type}</p>
                        </div>
                        <div class="glass-panel-inner" style="padding: 1rem; margin-bottom: 1rem;">
                            <h4 style="margin-top:0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;"><i class="fa-solid fa-user-tie text-accent"></i> ข้อมูลขับรถ</h4>
                            <p><strong>ชื่อ-สกุล:</strong> ${vehicle.driver}</p>
                            <p><strong>เบอร์โทร:</strong> ${vehicle.driverPhone}</p>
                        </div>
                        <div class="glass-panel-inner" style="padding: 1rem; margin-bottom: 1rem;">
                            <h4 style="margin-top:0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;"><i class="fa-solid fa-clipboard-user text-accent"></i> ผู้จองและจุดประสงค์</h4>
                            <p><strong>ผู้จอง:</strong> ${vehicle.requester} (${vehicle.reqDept})</p>
                            <p><strong>รายละเอียดงาน:</strong> ${vehicle.detail}</p>
                        </div>
                        <div class="glass-panel-inner" style="padding: 1rem;">
                            <h4 style="margin-top:0; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;"><i class="fa-solid fa-location-dot text-accent"></i> สถานะการเดินทางล่าสุด </h4>
                            <p><strong>เส้นทาง:</strong> ${vehicle.origin} <i class="fa-solid fa-arrow-right"></i> ${vehicle.dest}</p>
                            <p><strong>สถานะ:</strong> <span style="color: ${vehicle.statusColor === 'blue' ? '#3b82f6' : vehicle.statusColor === 'yellow' ? '#f59e0b' : '#8b5cf6'}; font-weight: bold;">${vehicle.status}</span></p>
                            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; margin-top: 10px; overflow: hidden;">
                                <div style="width: ${vehicle.progress}%; height: 100%; background: ${vehicle.statusColor === 'blue' ? '#3b82f6' : vehicle.statusColor === 'yellow' ? '#f59e0b' : '#8b5cf6'}; transition: width 1s;"></div>
                            </div>
                            <small class="text-muted" style="display:block; text-align:right; margin-top:5px;">ความคืบหน้าการเดินทาง: ${vehicle.progress}%</small>
                        </div>
                        <div style="margin-top: 1rem; text-align: center;">
                            <small class="text-secondary"><i class="fa-solid fa-satellite-dish"></i> ผูกตัวรับพิกัดจาก GPS แบบ Real-time</small>
                            <br>
                            <button onclick="
                                const marker = vehicleMarkers ? vehicleMarkers['${vid}'] : null;
                                let destLat = 13.736717;
                                let destLng = 100.523186;
                                if (marker) {
                                    const pos = marker.getLatLng();
                                    destLat = pos.lat;
                                    destLng = pos.lng;
                                }
                                window.open('https://www.google.com/maps/dir/?api=1&destination=' + destLat + ',' + destLng, '_blank');
                            " class="btn" style="background: linear-gradient(135deg, #10b981, #059669); font-size: 0.9rem; padding: 0.5rem 1rem; margin-top: 10px; width: auto;"><i class="fa-solid fa-map-location-dot"></i> นำทางผ่าน Google Maps</button>
                        </div>
                    `;
                    modal.style.display = 'flex';
                }
            });
        });

        // Initialize Charts if Chart.js is loaded
        if (typeof Chart !== 'undefined') {
            Chart.defaults.color = '#9ca3af';
            Chart.defaults.font.family = "'Inter', 'Prompt', sans-serif";

            const ctxPie = document.getElementById('statusPieChart');
            if (ctxPie) {
                new Chart(ctxPie, {
                    type: 'doughnut',
                    data: {
                        labels: ['กำลังเดินทาง', 'เตรียมเดินทาง', 'ถึงเป้าหมายแล้ว', 'จอดพัก / หลับ'],
                        datasets: [{
                            data: [3, 5, 12, 1],
                            backgroundColor: [
                                '#3b82f6', // blue
                                '#f59e0b', // yellow
                                '#10b981', // green
                                '#8b5cf6'  // purple
                            ],
                            borderWidth: 0,
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#e5e7eb', padding: 20 } }
                        },
                        cutout: '70%'
                    }
                });
            }

            const ctxBar = document.getElementById('usageBarChart');
            if (ctxBar) {
                new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'],
                        datasets: [{
                            label: 'ปริมาณเที่ยวขนส่ง',
                            data: [12, 19, 15, 25, 22, 10, 8],
                            backgroundColor: 'rgba(59, 130, 246, 0.8)',
                            borderRadius: 6,
                            barThickness: 'flex',
                            maxBarThickness: 40
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false } },
                            x: { grid: { display: false, drawBorder: false } }
                        }
                    }
                });
            }
        }
    }

    // -- Route Optimization Initialization --
    function initRouteOptimization() {
        try {
            const mapContainer = document.getElementById('optimizer-map');
            const listEl = document.getElementById('route-waypoints-list');
            const btnAddStop = document.getElementById('btn-add-route-stop');
            const btnCalcRoute = document.getElementById('btn-calc-route');
            
            if (!mapContainer || !listEl) return;
            if (typeof L === 'undefined') {
                console.error('Leaflet not loaded');
                mapContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">ข้อผิดพลาด: ไม่สามารถโหลดแผนที่ได้ (Leaflet not found)</div>';
                return;
            }

        window.optMap = L.map('optimizer-map').setView([13.736717, 100.523186], 10);
        const optMap = window.optMap;

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(optMap);

        let routingControl = null;
        let routeWaypoints = [
            L.latLng(13.736717, 100.523186), // Default Start (BKK)
            null // Default empty destination
        ];

        function renderWaypointList() {
            if(!listEl) return;
            
            listEl.innerHTML = routeWaypoints.map((wp, i) => `
                <div class="flex-between" style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 6px;">
                    <div style="flex-grow: 1; display: flex; align-items: center; gap: 10px;">
                        <span class="badge" style="background: ${i===0 ? '#3b82f6' : '#ef4444'};">${i===0 ? 'เริ่ม' : 'จุดที่ '+i}</span>
                        <input type="text" 
                               class="wp-loc hover-input" 
                               placeholder="พิมพ์พิกัด (lat,lng) หรือคลิกบนแผนที่เพื่อปักหมุด" 
                               value="${wp ? (wp.lat.toFixed(4)+','+wp.lng.toFixed(4)) : ''}"
                               data-index="${i}"
                               style="background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 5px 10px; border-radius: 4px; width: 100%;">
                    </div>
                    ${i > 1 ? `<button type="button" class="btn-icon text-danger btn-remove-wp" data-index="${i}"><i class="fa-solid fa-trash"></i></button>` : ''}
                </div>
            `).join('');

            listEl.querySelectorAll('.wp-loc').forEach(inp => {
                inp.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.getAttribute('data-index'));
                    const vals = e.target.value.split(',');
                    if (vals.length >= 2) {
                        const lat = parseFloat(vals[0].trim());
                        const lng = parseFloat(vals[1].trim());
                        if (!isNaN(lat) && !isNaN(lng)) {
                            routeWaypoints[idx] = L.latLng(lat, lng);
                        }
                    }
                });
            });

            listEl.querySelectorAll('.btn-remove-wp').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                    routeWaypoints.splice(idx, 1);
                    renderWaypointList();
                    
                    // Auto recalculate after removing
                    if(btnCalcRoute && routeWaypoints.filter(wp => wp !== null).length >= 2) {
                        btnCalcRoute.click();
                    }
                });
            });
        }

        renderWaypointList();

        if(btnAddStop) {
            btnAddStop.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('btnAddStop clicked');
                routeWaypoints.push(null);
                renderWaypointList();
                
                // Focus the newly added input
                const inputs = listEl.querySelectorAll('.wp-loc');
                if (inputs.length > 0) {
                    const lastInp = inputs[inputs.length - 1];
                    lastInp.focus();
                    listEl.scrollTop = listEl.scrollHeight;
                }
            });
        }
        
        // Map Click to Add Waypoint
        optMap.on('click', function(e) {
            console.log('Map clicked at', e.latlng);
            let emptyIdx = routeWaypoints.findIndex(wp => wp === null);
            if (emptyIdx === -1) {
                // If all filled, push a new one
                routeWaypoints.push(e.latlng);
            } else {
                // Fill the empty one
                routeWaypoints[emptyIdx] = e.latlng;
            }
            renderWaypointList();
            
            // Auto recalculate route to show immediate visual feedback
            if(btnCalcRoute && routeWaypoints.filter(wp => wp !== null).length >= 2) {
                btnCalcRoute.click();
            }
        });

        if(btnCalcRoute) {
            btnCalcRoute.addEventListener('click', () => {
                const activeWps = routeWaypoints.filter(wp => wp !== null);
                if (activeWps.length < 2) {
                    alert('กรุณาระบุจุดเริ่มต้นและจุดปลายทาง (พิกัด lat,lng) อย่างน้อย 1 คู่');
                    return;
                }

                if (routingControl) {
                    optMap.removeControl(routingControl);
                }

                if (typeof L.Routing === 'undefined') {
                    alert('ไม่สามารถโหลดระบบนำทาง (Routing Machine) ได้ในขณะนี้ กรุณารีเฟรชหน้าเว็บหรือตรวจสอบอินเทอร์เน็ต');
                    return;
                }

                // Add loading indicator manually
                document.getElementById('route-total-distance').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                document.getElementById('route-total-time').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                routingControl = L.Routing.control({
                    waypoints: activeWps,
                    routeWhileDragging: true,
                    show: false, // hide instructions panel to keep UI clean
                    lineOptions: {
                        styles: [{color: '#10b981', opacity: 0.8, weight: 6}]
                    },
                    createMarker: function(i, wp, nWps) {
                        return L.marker(wp.latLng, {
                            icon: L.divIcon({
                                className: 'custom-route-marker',
                                html: `<div style="background-color: ${i===0?'#3b82f6':'#ef4444'}; width: 24px; height: 24px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);">${i===0?'S':i}</div>`,
                                iconSize: [28, 28],
                                iconAnchor: [14, 14]
                            })
                        }).bindPopup(i===0?'จุดเริ่มต้น':('จุดที่ '+i));
                    }
                }).addTo(optMap);

                routingControl.on('routesfound', function(e) {
                    const routes = e.routes;
                    const summary = routes[0].summary;
                    document.getElementById('route-total-distance').textContent = (summary.totalDistance / 1000).toFixed(2) + ' กม.';
                    const totalMinutes = Math.round(summary.totalTime / 60);
                    const hours = Math.floor(totalMinutes / 60);
                    const mins = totalMinutes % 60;
                    document.getElementById('route-total-time').textContent = hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;
                });
                
                routingControl.on('routingerror', function(e) {
                    alert('ไม่สามารถคำนวณเส้นทางได้ กรุณาตรวจสอบพิกัดหรือการเชื่อมต่ออินเทอร์เน็ต');
                    document.getElementById('route-total-distance').textContent = 'Error';
                    document.getElementById('route-total-time').textContent = 'Error';
                });
            });
        }

        const btnOptimizeRoute = document.getElementById('btn-optimize-route');
        if(btnOptimizeRoute) {
            btnOptimizeRoute.addEventListener('click', () => {
                const activeWps = routeWaypoints.filter(wp => wp !== null);
                if (activeWps.length <= 2) {
                    alert('การจัดลำดับต้องการจุดหมายระหว่างทางอย่างน้อย 2 จุด (ไม่นับจุดเริ่มต้น)');
                    return;
                }
                
                const start = activeWps[0];
                let unvisited = activeWps.slice(1);
                let optimized = [start];
                let current = start;

                while (unvisited.length > 0) {
                    let nearestIdx = 0;
                    let minDist = Infinity;
                    for (let i = 0; i < unvisited.length; i++) {
                        const dist = current.distanceTo(unvisited[i]);
                        if (dist < minDist) {
                            minDist = dist;
                            nearestIdx = i;
                        }
                    }
                    current = unvisited[nearestIdx];
                    optimized.push(current);
                    unvisited.splice(nearestIdx, 1);
                }
                
                routeWaypoints = optimized;
                routeWaypoints.push(null);
                
                renderWaypointList();
                if(btnCalcRoute) btnCalcRoute.click();
            });
        }

        const btnSaveRoute = document.getElementById('btn-save-route-plan');
        if(btnSaveRoute) {
            btnSaveRoute.addEventListener('click', () => {
                const selectEl = document.getElementById('route-vehicle-select');
                if(!selectEl || !selectEl.value) {
                    alert('กรุณาเลือกรถที่จะใช้สำหรับเส้นทางนี้');
                    return;
                }
                
                const activeWps = routeWaypoints.filter(wp => wp !== null);
                if(activeWps.length < 2) {
                    alert('กรุณาคำนวณเส้นทางก่อนบันทึก');
                    return;
                }
                
                const vehicleText = selectEl.options[selectEl.selectedIndex].text;
                alert(`บันทึกแผนงานและสร้างงานจัดส่งให้กับรถ [${vehicleText}] สำเร็จเรียบร้อยแล้ว! ข้อมูลถูกส่งเข้าสู่ระบบของคนขับแล้ว.`);
                
                routeWaypoints = [
                    L.latLng(13.736717, 100.523186),
                    null
                ];
                renderWaypointList();
                document.getElementById('route-total-distance').textContent = '0 กม.';
                document.getElementById('route-total-time').textContent = '0 นาที';
                if(routingControl) {
                    optMap.removeControl(routingControl);
                    routingControl = null;
                }
                selectEl.value = '';
            });
        }

        // Fix map sizing on tab switch
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.getAttribute('data-target') === 'route-optimization') {
                    setTimeout(() => {
                        optMap.invalidateSize();
                    }, 200);
                }
            });
        });
        } catch (err) {
            console.error('Error in initRouteOptimization:', err);
        }
    }

    // -- Load Planning Module --
    function initLoadPlanning() {
        const truckSelect = document.getElementById('packing-truck-select');
        const cargoPool = document.getElementById('cargo-pool-list');
        const truckBed = document.getElementById('truck-bed-container');
        const unassignedCount = document.getElementById('packing-unassigned-count');
        const btnAutoPack = document.getElementById('btn-auto-pack');
        const btnReset = document.getElementById('btn-reset-pack');

        if (!truckSelect || !cargoPool || !truckBed) return;

        const truckCapacities = {
            '4W': { weight: 1500, volume: 10 },
            '6W': { weight: 5000, volume: 30 },
            '10W': { weight: 15000, volume: 60 }
        };

        let currentCargo = [
            { id: 1, name: 'P-001: อะไหล่แอร์', weight: 450, vol: 2.5, qty: 2 },
            { id: 2, name: 'P-002: มอเตอร์ไฟฟ้า', weight: 800, vol: 4.2, qty: 1 },
            { id: 3, name: 'P-003: สายไฟม้วนใหญ่', weight: 1200, vol: 6.0, qty: 2 },
            { id: 4, name: 'P-004: แผงควบคุม', weight: 300, vol: 1.5, qty: 3 },
            { id: 5, name: 'P-005: น็อตและสกรู', weight: 200, vol: 0.8, qty: 5 }
        ];

        let assignedCargo = [];

        function renderCargoPool() {
            cargoPool.innerHTML = '';
            let count = 0;
            currentCargo.forEach(item => {
                for(let i=0; i<item.qty; i++) {
                    const cargoEl = document.createElement('div');
                    cargoEl.className = 'cargo-box';
                    cargoEl.draggable = true;
                    cargoEl.id = `cargo-${item.id}-${Date.now()}-${i}`;
                    cargoEl.innerHTML = `
                        <strong>${item.name}</strong>
                        <div class="cargo-tag">${item.weight} kg / ${item.vol} CBM</div>
                    `;
                    
                    cargoEl.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify({id: item.id, weight: item.weight, vol: item.vol, name: item.name}));
                        cargoEl.classList.add('dragging');
                    });

                    cargoEl.addEventListener('dragend', () => {
                        cargoEl.classList.remove('dragging');
                    });

                    cargoPool.appendChild(cargoEl);
                    count++;
                }
            });
            unassignedCount.textContent = count + ' ชิ้น';
        }

        function updatePackingStats() {
            const selectedTruck = truckSelect.value;
            const cap = truckCapacities[selectedTruck];
            
            const totalWeight = assignedCargo.reduce((sum, item) => sum + item.weight, 0);
            const totalVol = assignedCargo.reduce((sum, item) => sum + item.vol, 0);
            
            const weightPct = Math.min(100, Math.round((totalWeight / cap.weight) * 100));
            const volPct = Math.min(100, Math.round((totalVol / cap.volume) * 100));
            
            document.getElementById('packing-weight-text').textContent = `${totalWeight.toLocaleString()} / ${cap.weight.toLocaleString()} kg`;
            document.getElementById('packing-weight-percent').textContent = weightPct + '%';
            document.getElementById('packing-weight-bar').style.width = weightPct + '%';
            document.getElementById('packing-weight-bar').style.backgroundColor = weightPct > 90 ? '#ef4444' : '#f97316';
            
            document.getElementById('packing-vol-text').textContent = `${totalVol.toFixed(1)} / ${cap.volume} CBM`;
            document.getElementById('packing-vol-percent').textContent = volPct + '%';
            document.getElementById('packing-vol-bar').style.width = volPct + '%';
            document.getElementById('packing-vol-bar').style.backgroundColor = volPct > 90 ? '#ef4444' : '#3b82f6';
            
            const placeholder = document.getElementById('truck-bed-placeholder');
            if(assignedCargo.length > 0) {
                placeholder.style.display = 'none';
            } else {
                placeholder.style.display = 'block';
            }
        }

        truckBed.addEventListener('dragover', (e) => {
            e.preventDefault();
            truckBed.classList.add('drag-over');
        });

        truckBed.addEventListener('dragleave', () => {
            truckBed.classList.remove('drag-over');
        });

        truckBed.addEventListener('drop', (e) => {
            e.preventDefault();
            truckBed.classList.remove('drag-over');
            
            const jsonData = e.dataTransfer.getData('application/json');
            if(!jsonData) return;
            const data = JSON.parse(jsonData);
            
            // Check capacity
            const selectedTruck = truckSelect.value;
            const cap = truckCapacities[selectedTruck];
            const totalWeight = assignedCargo.reduce((sum, item) => sum + item.weight, 0);
            
            if (totalWeight + data.weight > cap.weight) {
                alert('น้ำหนักเกินขีดจำกัดของรถคันนี้!');
                return;
            }

            // Move from pool to assigned
            assignedCargo.push(data);
            
            // Remove from currentCargo (decrement qty)
            const itemIdx = currentCargo.findIndex(i => i.id === data.id);
            if(itemIdx !== -1) {
                currentCargo[itemIdx].qty--;
                if(currentCargo[itemIdx].qty === 0) {
                    currentCargo.splice(itemIdx, 1);
                }
            }
            
            // Visual element in truck
            const droppedEl = document.createElement('div');
            droppedEl.className = 'cargo-box';
            droppedEl.style.minWidth = '100px';
            droppedEl.style.padding = '8px';
            droppedEl.style.fontSize = '0.75rem';
            droppedEl.innerHTML = `<strong>${data.name.split(':')[0]}</strong><div class="cargo-tag">${data.weight}kg</div>`;
            truckBed.appendChild(droppedEl);
            
            renderCargoPool();
            updatePackingStats();
        });

        btnAutoPack.addEventListener('click', () => {
            const selectedTruck = truckSelect.value;
            const cap = truckCapacities[selectedTruck];
            
            // Simple greedy packing
            currentCargo.sort((a,b) => b.weight - a.weight); // Pack heavy first
            
            let totalWeight = assignedCargo.reduce((sum, item) => sum + item.weight, 0);
            
            for (let i = currentCargo.length - 1; i >= 0; i--) {
                const item = currentCargo[i];
                while(item.qty > 0 && totalWeight + item.weight <= cap.weight) {
                    totalWeight += item.weight;
                    const data = {id: item.id, name: item.name, weight: item.weight, vol: item.vol};
                    assignedCargo.push(data);
                    item.qty--;
                    
                    const droppedEl = document.createElement('div');
                    droppedEl.className = 'cargo-box';
                    droppedEl.style.minWidth = '100px';
                    droppedEl.style.padding = '8px';
                    droppedEl.style.fontSize = '0.75rem';
                    droppedEl.innerHTML = `<strong>${data.name.split(':')[0]}</strong><div class="cargo-tag">${data.weight}kg</div>`;
                    truckBed.appendChild(droppedEl);
                }
                if(item.qty === 0) currentCargo.splice(i, 1);
            }
            
            renderCargoPool();
            updatePackingStats();
        });

        btnReset.addEventListener('click', () => {
            // Restore all to pool
            currentCargo = [
                { id: 1, name: 'P-001: อะไหล่แอร์', weight: 450, vol: 2.5, qty: 2 },
                { id: 2, name: 'P-002: มอเตอร์ไฟฟ้า', weight: 800, vol: 4.2, qty: 1 },
                { id: 3, name: 'P-003: สายไฟม้วนใหญ่', weight: 1200, vol: 6.0, qty: 2 },
                { id: 4, name: 'P-004: แผงควบคุม', weight: 300, vol: 1.5, qty: 3 },
                { id: 5, name: 'P-005: น็อตและสกรู', weight: 200, vol: 0.8, qty: 5 }
            ];
            assignedCargo = [];
            
            // Clear truck bed but keep placeholder
            const placeholder = document.getElementById('truck-bed-placeholder');
            truckBed.innerHTML = '';
            truckBed.appendChild(placeholder);
            
            renderCargoPool();
            updatePackingStats();
        });

        truckSelect.addEventListener('change', updatePackingStats);

        renderCargoPool();
        updatePackingStats();
    }

    // -- Delivery Scheduling Module --
    const deliveryScheduleBody = document.getElementById('delivery-schedule-body');
    
    function renderScheduleTable() {
        if (!deliveryScheduleBody) return;
        
        // Mock Trips (In a real app, this would come from LB/Route Save)
        const mockTrips = [
            { id: 'JOB-9001', car: '6W-8492', driver: 'สมชาย ใจดี', origin: 'โกดัง A', dest: 'ชลบุรี', start: '08:00', eta: '11:30', status: 'in_transit' },
            { id: 'JOB-9002', car: '4W-1122', driver: 'สมศรี มีชัย', origin: 'สำนักงานใหญ่', dest: 'สมุทรปราการ', start: '13:00', eta: '14:30', status: 'scheduled' },
            { id: 'JOB-9003', car: '10W-5555', driver: 'สมศักดิ์ รักชาติ', origin: 'ท่าเรือแหลมฉบัง', dest: 'พระนครศรีอยุธยา', start: '06:00', eta: '09:00', status: 'delivered' }
        ];

        const carFilter = document.getElementById('schedule-filter-car') ? document.getElementById('schedule-filter-car').value : 'all';
        const statusFilter = document.getElementById('schedule-filter-status') ? document.getElementById('schedule-filter-status').value : 'all';

        const filtered = mockTrips.filter(t => {
            const matchCar = carFilter === 'all' || t.car === carFilter;
            const matchStatus = statusFilter === 'all' || t.status === statusFilter;
            return matchCar && matchStatus;
        });

        if (filtered.length === 0) {
            deliveryScheduleBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">ไม่พบข้อมูลที่ตรงตามเงื่อนไข</td></tr>';
        } else {
            deliveryScheduleBody.innerHTML = filtered.map(t => `
                <tr>
                    <td><strong>${t.id}</strong></td>
                    <td>${t.car}<br><small class="text-secondary">${t.driver}</small></td>
                    <td>${t.origin} <i class="fa-solid fa-arrow-right mx-1" style="font-size:0.75rem;"></i> ${t.dest}</td>
                    <td>${t.start} - <span class="text-accent">${t.eta}</span></td>
                    <td>
                        <span class="badge" style="background: ${t.status === 'delivered' ? 'rgba(16, 185, 129, 0.2)' : t.status === 'in_transit' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}; color: ${t.status === 'delivered' ? '#10b981' : t.status === 'in_transit' ? '#3b82f6' : '#f59e0b'}; padding: 4px 8px; border-radius: 4px;">
                            ${t.status === 'delivered' ? 'ส่งมอบแล้ว' : t.status === 'in_transit' ? 'กำลังเดินทาง' : 'กำหนดการแล้ว'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-icon text-accent" title="ดูรายละเอียด"><i class="fa-solid fa-eye"></i></button>
                        <button class="btn-icon text-primary" title="แก้ไขเวลา"><i class="fa-solid fa-clock"></i></button>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Expose globally for filters
    window.renderScheduleTable = renderScheduleTable;

    // -- Fleet Management (Maintenance & Fuel) --
    const btnAddMaintenance = document.getElementById('btn-add-maintenance');
    if (btnAddMaintenance) {
        btnAddMaintenance.addEventListener('click', () => {
            alert('เปิดฟอร์มบันทึกการซ่อมบำรุง (Maintenance Form)... \n[Feature logic to be connected with DB]');
        });
    }

    const btnAddFuelLog = document.getElementById('btn-add-fuel-log');
    if (btnAddFuelLog) {
        btnAddFuelLog.addEventListener('click', () => {
            alert('เปิดฟอร์มบันทึกการเติมน้ำมัน (Fuel Log Form)... \n[Feature logic to be connected with DB]');
        });
    }

    // -- Dashboard Map and Charts Logic --
    window.dashboardMap = null;
    
    function initDashboard() {
        // 1. Initialize Leaflet Map
        try {
            const mapContainer = document.getElementById('dashboard-live-map');
            if (mapContainer && !window.dashboardMap) {
                if (typeof L === 'undefined') {
                    mapContainer.innerHTML = '<div style="color: #ef4444; padding: 20px; text-align: center; border: 1px dashed #ef4444; height: 100%; display:flex; align-items:center; justify-content:center;">⚠️ ไม่สามารถโหลดแผนที่ได้: กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต (Leaflet CDN is blocked)</div>';
                } else {
                    window.dashboardMap = L.map('dashboard-live-map').setView([13.736717, 100.523186], 6); // Centered on Thailand
                    
                    // Add OpenStreetMap tiles
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }).addTo(window.dashboardMap);

                    // Mock Vehicles with animated or static icons
                    const mockVehicles = [
                        { id: 'กท 1234', lat: 13.736717, lng: 100.523186, status: 'traveling', driver: 'สมชาย มั่นคง', dest: 'ชลบุรี' },
                        { id: 'ชร 9999', lat: 18.7883, lng: 98.9853, status: 'resting', driver: 'วิเชียร ใจดี', dest: 'เชียงใหม่' },
                        { id: 'ขก 5555', lat: 16.4322, lng: 102.8236, status: 'preparing', driver: 'สมศักดิ์ รักชาติ', dest: 'ขอนแก่น' },
                        { id: 'สง 8888', lat: 7.0080, lng: 100.4639, status: 'arrived', driver: 'นที สินทรัพย์', dest: 'สงขลา' }
                    ];

                    const markers = [];
                    mockVehicles.forEach((v, index) => {
                        let color = '#3b82f6'; // traveling (blue)
                        if (v.status === 'arrived') color = '#10b981'; // green
                        else if (v.status === 'preparing') color = '#f59e0b'; // orange
                        else if (v.status === 'resting') color = '#8b5cf6'; // purple

                        const iconHtml = `
                            <div style="background-color: ${color}; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                                <i class="fa-solid fa-truck"></i>
                            </div>
                        `;
                        
                        const customIcon = L.divIcon({
                            className: 'custom-vehicle-marker',
                            html: iconHtml,
                            iconSize: [30, 30],
                            iconAnchor: [15, 15]
                        });

                        const marker = L.marker([v.lat, v.lng], { icon: customIcon }).addTo(window.dashboardMap)
                            .bindPopup(`<b>ทะเบียน: ${v.id}</b><br>คนขับ: ${v.driver}<br>ปลายทาง: ${v.dest}`);
                        
                        markers.push(marker);

                        // Simple simulated animation: Move marker slightly over time
                        if (v.status === 'traveling') {
                            setInterval(() => {
                                const newLat = marker.getLatLng().lat + (Math.random() - 0.5) * 0.01;
                                const newLng = marker.getLatLng().lng + (Math.random() - 0.5) * 0.01;
                                marker.setLatLng([newLat, newLng]);
                            }, 3000); // update every 3 seconds
                        }
                    });
                    
                    // Adjust bounds to fit all markers
                    const group = L.featureGroup(markers);
                    window.dashboardMap.fitBounds(group.getBounds().pad(0.1));
                    
                    // Fix rendering if map wasn't strictly visible at 0ms
                    setTimeout(() => {
                        window.dashboardMap.invalidateSize();
                    }, 400);
                }
            }
        } catch (e) { console.error('Map init error:', e); }

        // 2. Initialize Pie Chart
        try {
            const pieCtx = document.getElementById('statusPieChart');
            if (pieCtx) {
                if (typeof Chart === 'undefined') {
                    pieCtx.parentElement.innerHTML = '<div style="color: #ef4444; text-align:center; padding: 20px;">⚠️ ขาดไลบรารี Chart.js</div>';
                } else {
                    new Chart(pieCtx, {
                        type: 'doughnut',
                        data: {
                            labels: ['กำลังเดินทาง', 'ถึงเป้าหมายแล้ว', 'เตรียมเดินทาง', 'จอดพัก / หลับ'],
                            datasets: [{
                                data: [3, 12, 5, 1],
                                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'],
                                borderWidth: 0,
                                hoverOffset: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { position: 'bottom', labels: { color: '#ccc' } }
                            }
                        }
                    });
                }
            }
        } catch (e) { console.error('Pie Chart error:', e); }

        // 3. Initialize Bar Chart
        try {
            const barCtx = document.getElementById('usageBarChart');
            if (barCtx) {
                if (typeof Chart === 'undefined') {
                    barCtx.parentElement.innerHTML = '<div style="color: #ef4444; text-align:center; padding: 20px;">⚠️ ขาดไลบรารี Chart.js</div>';
                } else {
                    new Chart(barCtx, {
                        type: 'bar',
                        data: {
                            labels: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
                            datasets: [{
                                label: 'ปริมาณงานจัดส่ง (เที่ยว)',
                                data: [15, 19, 13, 22, 28, 10, 5],
                                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                                borderColor: '#3b82f6',
                                borderWidth: 1,
                                borderRadius: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#999' } },
                                x: { grid: { display: false }, ticks: { color: '#999' } }
                            },
                            plugins: {
                                legend: { display: false }
                            }
                        }
                    });
                }
            }
        } catch (e) { console.error('Bar Chart error:', e); }

        // 4. Populate Vehicles Table
        try {
            const vehiclesTableBody = document.getElementById('dashboard-vehicles-table');
            if (vehiclesTableBody) {
                const tableData = [
                    { id: 'กท 1234', driver: 'สมชาย มั่นคง', booker: 'ฝ่ายขาย (คุณเอนก)', route: 'BKK - ชลบุรี', status: 'traveling' },
                    { id: 'ชร 9999', driver: 'วิเชียร ใจดี', booker: 'ฝ่ายบุคคล', route: 'BKK - เชียงใหม่', status: 'resting' },
                    { id: 'ขก 5555', driver: 'สมศักดิ์ รักชาติ', booker: 'ฝ่ายจัดซื้อ', route: 'ระยอง - ขอนแก่น', status: 'preparing' },
                    { id: 'สง 8888', driver: 'นที สินทรัพย์', booker: 'คลังสินค้า', route: 'BKK - สงขลา', status: 'arrived' },
                    { id: 'นบ 2024', driver: 'ธีระพงษ์', booker: 'ฝ่ายการตลาด', route: 'BKK - นนทบุรี', status: 'traveling' }
                ];

                let tableHtml = '';
                tableData.forEach(v => {
                    let badgeClass = 'rgba(59, 130, 246, 0.2)';
                    let textColor = '#3b82f6';
                    let statusText = 'กำลังเดินทาง';
                    
                    if (v.status === 'arrived') { badgeClass = 'rgba(16, 185, 129, 0.2)'; textColor = '#10b981'; statusText = 'ถึงเป้าหมาย'; }
                    else if (v.status === 'preparing') { badgeClass = 'rgba(245, 158, 11, 0.2)'; textColor = '#f59e0b'; statusText = 'เตรียมเดินทาง'; }
                    else if (v.status === 'resting') { badgeClass = 'rgba(139, 92, 246, 0.2)'; textColor = '#8b5cf6'; statusText = 'จอดพัก'; }

                    tableHtml += `
                        <tr class="vehicle-row" data-id="${v.id}" data-driver="${v.driver}" data-route="${v.route}" data-status="${statusText}" style="cursor: pointer;">
                            <td><strong>${v.id}</strong></td>
                            <td>${v.driver}</td>
                            <td>${v.booker}</td>
                            <td>${v.route}</td>
                            <td><span class="badge" style="background: ${badgeClass}; color: ${textColor}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">${statusText}</span></td>
                        </tr>
                    `;
                });
                vehiclesTableBody.innerHTML = tableHtml;

                // Add double-click events for Modal
                vehiclesTableBody.querySelectorAll('.vehicle-row').forEach(row => {
                    row.addEventListener('dblclick', () => {
                        openVehicleModal(row.dataset);
                    });
                });
            }
        } catch (e) { console.error('Table error:', e); }
    }

    function openVehicleModal(data) {
        const modal = document.getElementById('vehicle-detail-modal');
        const content = document.getElementById('vehicle-detail-content');
        if (modal && content) {
            content.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <i class="fa-solid fa-truck-fast fa-3x text-accent mb-2"></i>
                    <h2 class="text-primary-gradient" style="margin: 0;">${data.id}</h2>
                    <div class="text-secondary">คนขับ: ${data.driver}</div>
                </div>
                <div class="glass-panel-inner" style="background: rgba(0,0,0,0.3);">
                    <ul style="list-style: none; padding: 0; margin: 0; line-height: 2;">
                        <li><strong><i class="fa-solid fa-route" style="width: 25px; text-align: center;"></i> เส้นทาง:</strong> ${data.route}</li>
                        <li><strong><i class="fa-solid fa-circle-info" style="width: 25px; text-align: center;"></i> สถานะ:</strong> <span class="text-accent">${data.status}</span></li>
                        <li><strong><i class="fa-solid fa-clock" style="width: 25px; text-align: center;"></i> อัปเดตล่าสุด:</strong> ${new Date().toLocaleTimeString('th-TH')} น.</li>
                        <li><strong><i class="fa-solid fa-temperature-half" style="width: 25px; text-align: center;"></i> อุณหภูมิตู้:</strong> 4.5 °C (ปกติ)</li>
                        <li><strong><i class="fa-solid fa-gauge" style="width: 25px; text-align: center;"></i> ความเร็วปัจจุบัน:</strong> ${data.status.includes('เดินทาง') ? '65 กม./ชม.' : '0 กม./ชม.'}</li>
                    </ul>
                </div>
                <div class="form-actions mt-4">
                    <button class="btn btn-primary w-full" onclick="document.getElementById('vehicle-detail-modal').classList.remove('active'); document.getElementById('vehicle-detail-modal').style.display='none';"><i class="fa-solid fa-check"></i> ตกลง</button>
                </div>
            `;
            modal.classList.add('active');
            modal.style.display = 'flex';
        }
    }
    
    // Close modal event (if clicking outside or close button)
    const btnCloseVehicleModal = document.getElementById('btn-close-vehicle-modal');
    if (btnCloseVehicleModal) {
        btnCloseVehicleModal.addEventListener('click', () => {
            const modal = document.getElementById('vehicle-detail-modal');
            modal.classList.remove('active');
            modal.style.display = 'none';
        });
    }

    // -- Final Initialization --
    try {
        initFuelPrices();
        if (typeof initDashboard === 'function') initDashboard();
        if (typeof window.loadAdminData === 'function') window.loadAdminData();
        if (typeof window.renderCarArrangementTable === 'function') window.renderCarArrangementTable();
        if (typeof window.renderPackingTable === 'function') window.renderPackingTable();
        initRouteOptimization();
        initLoadPlanning();
        renderScheduleTable();
    } catch (e) {
        console.error('General initialization error:', e);
    }
});
