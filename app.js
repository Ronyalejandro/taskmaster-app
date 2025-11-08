// Estado de la aplicación
let tasks = JSON.parse(localStorage.getItem('tasks')) || [];
let currentFilter = 'all';
let lastDeleted = null;
let undoTimeout = null;

// Elementos del DOM
const taskInput = document.getElementById('taskInput');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const filterBtns = document.querySelectorAll('.filter-btn');
const totalTasksEl = document.getElementById('totalTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const completedTasksEl = document.getElementById('completedTasks');

// Inicializar
init();

function init() {
    renderTasks();
    updateStats();
    
    // Event Listeners
    addBtn.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });
}

function addTask() {
    const text = taskInput.value.trim();
    
    if (!text) {
        taskInput.focus();
        return;
    }
    
    const task = {
        id: Date.now(),
        text: text,
        completed: false,
        createdAt: new Date().toISOString()
    };
    
    tasks.unshift(task);
    saveTasks();
    taskInput.value = '';
    taskInput.focus();
    renderTasks();
    updateStats();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        renderTasks();
        updateStats();
    }
}

function deleteTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Eliminar de la lista y guardar estado, pero conservar en buffer para deshacer
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderTasks();
    updateStats();

    lastDeleted = task;
    showUndoToast(task);
}

function renderTasks() {
    // Filtrar tareas
    let filteredTasks = tasks;
    if (currentFilter === 'pending') {
        filteredTasks = tasks.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
        filteredTasks = tasks.filter(t => t.completed);
    }
    
    // Mostrar estado vacío si no hay tareas
    if (filteredTasks.length === 0) {
        emptyState.classList.add('show');
        taskList.style.display = 'none';
        return;
    }
    
    emptyState.classList.remove('show');
    taskList.style.display = 'flex';
    
    // Renderizar tareas
    taskList.innerHTML = filteredTasks.map(task => {
        const date = new Date(task.createdAt);
        const formattedDate = date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                     onclick="toggleTask(${task.id})">
                </div>
                <span class="task-text">${escapeHtml(task.text)}</span>
                <span class="task-date">${formattedDate}</span>
                <button class="task-edit" onclick="startEdit(${task.id})">Editar</button>
                <button class="task-delete" onclick="deleteTask(${task.id})">Eliminar</button>
            </li>
        `;
    }).join('');
}

// --- Edición in-place ---
function startEdit(id) {
    const li = document.querySelector(`li[data-id="${id}"]`);
    if (!li) return;
    if (li.classList.contains('editing')) return;

    const task = tasks.find(t => t.id === id);
    if (!task) return;

    li.classList.add('editing');

    const textEl = li.querySelector('.task-text');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = task.text;
    input.maxLength = 500;

    textEl.replaceWith(input);

    // Ocultar botones cuadricula mientras editamos
    const editBtn = li.querySelector('.task-edit');
    const deleteBtn = li.querySelector('.task-delete');
    if (editBtn) editBtn.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Crear botones guardar/cancelar
    const saveBtn = document.createElement('button');
    saveBtn.className = 'task-save';
    saveBtn.textContent = 'Guardar';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'task-cancel';
    cancelBtn.textContent = 'Cancelar';

    input.after(saveBtn);
    saveBtn.after(cancelBtn);

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    function cleanupUI() {
        // Removemos botones temporales y quitamos clase editing
        saveBtn.remove();
        cancelBtn.remove();
        li.classList.remove('editing');
    }

    saveBtn.addEventListener('click', () => saveEdit(id, input.value));
    cancelBtn.addEventListener('click', () => cancelEdit(id));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit(id, input.value);
        if (e.key === 'Escape') cancelEdit(id);
    });

    // Guardar edición
    function saveEdit(idToSave, newText) {
        const trimmed = newText.trim();
        if (!trimmed) {
            // si el texto queda vacío, cancelamos edición
            cancelEdit(idToSave);
            return;
        }

        const t = tasks.find(t => t.id === idToSave);
        if (t) {
            t.text = trimmed;
            saveTasks();
            cleanupUI();
            renderTasks();
            updateStats();
        }
    }

    function cancelEdit(idToCancel) {
        // Simplemente re-renderizamos para restaurar el estado visual original
        renderTasks();
    }
}

// --- Undo delete (toast) ---
function showUndoToast(deletedTask) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const undoBtn = document.getElementById('undoBtn');
    if (!toast || !toastMessage || !undoBtn) return;

    toastMessage.textContent = `Tarea "${deletedTask.text}" eliminada`;
    toast.hidden = false;
    toast.classList.add('show');

    // cancelar timeout anterior
    if (undoTimeout) clearTimeout(undoTimeout);

    undoTimeout = setTimeout(() => {
        // Al expirar, limpiar buffer
        lastDeleted = null;
        toast.hidden = true;
        toast.classList.remove('show');
    }, 5000);

    undoBtn.onclick = () => undoDelete();
}

function undoDelete() {
    if (!lastDeleted) return;
    tasks.unshift(lastDeleted);
    saveTasks();
    renderTasks();
    updateStats();

    // limpiar buffer y ocultar toast
    lastDeleted = null;
    if (undoTimeout) clearTimeout(undoTimeout);
    const toast = document.getElementById('toast');
    if (toast) {
        toast.hidden = true;
        toast.classList.remove('show');
    }
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    
    totalTasksEl.textContent = total;
    pendingTasksEl.textContent = pending;
    completedTasksEl.textContent = completed;
}

function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
