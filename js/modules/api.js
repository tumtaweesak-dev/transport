(function () {
    async function request(path, options = {}) {
        const res = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });

        const contentType = res.headers.get('content-type') || '';
        const payload = contentType.includes('application/json') ? await res.json() : await res.text();

        if (!res.ok) {
            const message = payload && payload.error ? payload.error : 'API request failed';
            throw new Error(message);
        }

        return payload;
    }

    window.TransportApi = {
        login(data) {
            return request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) });
        },
        resetPassword(data) {
            return request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(data) });
        },
        createUser(data) {
            return request('/api/users', { method: 'POST', body: JSON.stringify(data) });
        },
        listUsers() {
            return request('/api/users');
        },
        listMenuPermissions() {
            return request('/api/menu-permissions');
        },
        saveMenuPermission(employeeId, data) {
            return request(`/api/menu-permissions/${encodeURIComponent(employeeId)}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
        },
        deleteMenuPermission(employeeId) {
            return request(`/api/menu-permissions/${encodeURIComponent(employeeId)}`, {
                method: 'DELETE',
            });
        },
        createCar(data) {
            return request('/api/cars', { method: 'POST', body: JSON.stringify(data) });
        },
        listCars(options = {}) {
            const query = options.refresh ? '?refresh=1' : '';
            return request(`/api/cars${query}`);
        },
        createTravelRequest(data) {
            return request('/api/travel-requests', { method: 'POST', body: JSON.stringify(data) });
        },
        listTravelRequests(status) {
            const query = status ? `?status=${encodeURIComponent(status)}` : '';
            return request(`/api/travel-requests${query}`);
        },
        getTravelRequest(id) {
            return request(`/api/travel-requests/${encodeURIComponent(id)}`);
        },
        updateTravelRequestStatus(id, status, meta = {}) {
            return request(`/api/travel-requests/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                body: JSON.stringify({ status, ...meta }),
            });
        },
        addTravelRequestAttachments(id, attachments, meta = {}) {
            return request(`/api/travel-requests/${encodeURIComponent(id)}/attachments`, {
                method: 'POST',
                body: JSON.stringify({ attachments, ...meta }),
            });
        },
        deleteTravelRequestAttachment(id, attachmentId) {
            return request(`/api/travel-requests/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, {
                method: 'DELETE',
            });
        },
        updateTravelRequestCosts(id, data) {
            return request(`/api/travel-requests/${encodeURIComponent(id)}/costs`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            });
        },
        listGps() {
            return request('/api/gps');
        },
        getPttFuelPrices() {
            return request('/api/fuel-prices/ptt');
        },
        getBangchakFuelPrices() {
            return request('/api/fuel-prices/ptt');
        },
        getAiStatus() {
            return request('/api/ai/status');
        },
        sendAiMessage(data) {
            return request('/api/ai/chat', { method: 'POST', body: JSON.stringify(data) });
        },
        getAiGptAppStatus() {
            return request('/ai-gpt-app/api/status');
        },
        sendAiGptAppMessage(data) {
            return request('/ai-gpt-app/api/tms/chat', { method: 'POST', body: JSON.stringify(data) });
        },
        createAiGptAppImage(data) {
            return request('/ai-gpt-app/api/tms/images/create', { method: 'POST', body: JSON.stringify(data) });
        },
        editAiGptAppImage(data) {
            return request('/ai-gpt-app/api/tms/images/edit', { method: 'POST', body: JSON.stringify(data) });
        },
        listProjectJobs(search = '', company = {}, limit) {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (company.code) params.set('company', company.code);
            if (company.databaseName) params.set('database', company.databaseName);
            if (limit) params.set('limit', limit);
            const query = params.toString() ? `?${params.toString()}` : '';
            return request(`/api/project-jobs${query}`).then((payload) => Array.isArray(payload) ? payload : (payload.rows || []));
        },
        listProducts(search = '', company = {}, limit, codePrefixes = []) {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (company.code) params.set('company', company.code);
            if (company.databaseName) params.set('database', company.databaseName);
            if (limit) params.set('limit', limit);
            if (codePrefixes.length > 0) params.set('codePrefixes', codePrefixes.join(','));
            const query = params.toString() ? `?${params.toString()}` : '';
            return request(`/api/products${query}`).then((payload) => Array.isArray(payload) ? payload : (payload.rows || []));
        },
        createDeliveryNote(data) {
            return request('/api/delivery-notes', { method: 'POST', body: JSON.stringify(data) });
        },
        listDeliveryNotes() {
            return request('/api/delivery-notes');
        },
    };
})();
