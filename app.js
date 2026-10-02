const KEY = 'toursplit-data-v2';
const money = n => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const expenseCategories = ['food', 'fuel', 'stay', 'event', 'others'];

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || { tours: [], activeTourId: null };
let editing = { type: null, id: null };

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const initials = name => (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

const modal = $('#modal');
const modalForm = $('#modalForm');

function getActiveTour() {
  return state.tours.find(t => t.id === state.activeTourId) || null;
}

function getSummary() {
  const tour = getActiveTour();
  if (!tour) return { total: 0, share: 0, paid: {}, balances: [] };

  const total = tour.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const share = tour.members.length ? total / tour.members.length : 0;
  const paid = {};

  tour.members.forEach(m => { paid[m.id] = 0; });
  tour.expenses.forEach(e => {
    if (paid[e.paidBy] !== undefined) {
      paid[e.paidBy] += Number(e.amount || 0);
    }
  });

  const balances = tour.members.map(m => ({
    ...m,
    paid: paid[m.id] || 0,
    balance: (paid[m.id] || 0) - share
  }));

  return { total, share, paid, balances };
}

function buildSettlement(balances) {
  const creditors = balances
    .filter(x => x.balance > 0.005)
    .map(x => ({ ...x, amount: x.balance }))
    .sort((a, b) => b.amount - a.amount);

  const debtors = balances
    .filter(x => x.balance < -0.005)
    .map(x => ({ ...x, amount: -x.balance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ from: debtors[i].name, to: creditors[j].name, amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.005) i += 1;
    if (creditors[j].amount < 0.005) j += 1;
  }

  return transfers;
}

function renderSidebar() {
  const toursList = $('#toursList');
  toursList.innerHTML = state.tours.length
    ? state.tours.map(t => `
      <div class="tour-item ${t.id === state.activeTourId ? 'active' : ''}" data-tour-id="${t.id}">
        <div class="tour-item-content">
          <strong>${esc(t.name)}</strong>
          <small>${t.members.length} members · ${t.expenses.length} expenses</small>
        </div>
        <button class="tour-item-delete" onclick="window.deleteTourConfirm('${t.id}')">×</button>
      </div>
    `).join('')
    : '<p class="muted" style="padding: 12px 0; text-align: center; font-size: 12px;">No tours yet</p>';
}

function render() {
  const tour = getActiveTour();
  const active = !!tour;

  $('#heroSection').hidden = active;
  $('#statsGrid').hidden = !active;
  $('#dashboard').hidden = !active;

  renderSidebar();

  if (!active) {
    return;
  }

  const summary = getSummary();
  $('#totalSpent').textContent = money(summary.total);
  $('#memberCount').textContent = tour.members.length;
  $('#expenseCount').textContent = tour.expenses.length;
  $('#averageSpent').textContent = money(summary.share);

  $('#tourTitle').textContent = tour.name;
  $('#tourMeta').textContent = `${tour.start || 'No start date'}${tour.end ? ' → ' + tour.end : ''} · ${tour.members.length} members`;

  const settled = summary.balances.filter(x => Math.abs(x.balance) < 0.01).length;
  $('#settledCount').textContent = `${settled} settled`;

  $('#balanceList').innerHTML = summary.balances.length ? summary.balances.map(member => {
    const positive = member.balance > 0.005;
    const signText = positive ? 'Gets back ' : member.balance < -0.005 ? 'Owes ' : 'Settled ';
    const amountText = positive || member.balance < -0.005 ? money(Math.abs(member.balance)) : '';
    return `
      <div class="balance-row">
        <span class="avatar">${initials(member.name)}</span>
        <div class="row-main">
          <strong>${esc(member.name)}</strong>
          <small>Paid ${money(member.paid)} · Share ${money(summary.share)}</small>
        </div>
        <strong class="${positive ? 'positive' : member.balance < -0.005 ? 'negative' : 'neutral'}">${signText}${amountText}</strong>
      </div>
    `;
  }).join('') : '<p class="muted empty-line">Add members to see balances.</p>';

  const transfers = buildSettlement(summary.balances);
  $('#settlementTable').innerHTML = transfers.length ? `
    <div class="settlement-head"><span>Member paying</span><span>Member receiving</span><span>Amount</span></div>
    ${transfers.map(t => `
      <div class="settlement-row">
        <span><b>${esc(t.from)}</b><small>owes</small></span>
        <span><b>${esc(t.to)}</b><small>receives</small></span>
        <strong>${money(t.amount)}</strong>
      </div>
    `).join('')}
  ` : `
    <div class="all-settled"><span>✓</span><div><strong>Everyone is settled</strong><p>No payments are needed right now.</p></div></div>
  `;

  $('#expenseList').innerHTML = tour.expenses.length ? `<div class="expense-header"><span>Description</span><span>Category</span><span>Paid by</span><span>Amount</span><span></span></div>` +
    [...tour.expenses]
      .sort((a, b) => {
        const memberA = tour.members.find(m => m.id === a.paidBy);
        const memberB = tour.members.find(m => m.id === b.paidBy);
        const paidByA = (memberA?.name || 'Unknown').toLowerCase();
        const paidByB = (memberB?.name || 'Unknown').toLowerCase();

        if (paidByA !== paidByB) return paidByA.localeCompare(paidByB);

        const dateA = a.date || '';
        const dateB = b.date || '';
        if (dateA !== dateB) return dateA.localeCompare(dateB);

        return Number(a.amount || 0) - Number(b.amount || 0);
      })
      .map(e => {
        const payer = tour.members.find(m => m.id === e.paidBy);
        return `
          <div class="expense-row">
            <span><strong>${esc(e.description)}</strong><small>${e.date || ''}</small></span>
            <span>${esc(e.category || 'others')}</span>
            <span>${esc(payer?.name || 'Unknown')}</span>
            <strong>${money(e.amount)}</strong>
            <span class="row-actions">
              <button type="button" onclick="window.editExpense('${e.id}')">Edit</button>
              <button type="button" onclick="window.deleteExpense('${e.id}')">Delete</button>
            </span>
          </div>
        `;
      }).join('') : '<p class="muted empty-line">No expenses added yet.</p>';

  $('#memberList').innerHTML = tour.members.length ? tour.members.map(m => `
    <div class="member-row">
      <span class="avatar">${initials(m.name)}</span>
      <div class="row-main"><strong>${esc(m.name)}</strong><small>${esc(m.contact || '')}</small></div>
      <span class="row-actions">
        <button type="button" onclick="window.editMember('${m.id}')">Edit</button>
        <button type="button" onclick="window.deleteMember('${m.id}')">Delete</button>
      </span>
    </div>
  `).join('') : '<p class="muted empty-line">No members added yet.</p>';
}

function openModal(title, html) {
  if (!modal || !modalForm) return;
  $('#modalTitle').textContent = title;
  modalForm.innerHTML = `${html || ''}
    <div class="form-actions">
      <button type="button" class="button secondary" id="cancelModal">Cancel</button>
      <button class="button button-primary" type="submit">Save</button>
    </div>
  `;
  modal.hidden = false;
  setTimeout(() => modalForm.querySelector('input, select')?.focus(), 30);
}

function closeModal() {
  if (!modal) return;
  modal.hidden = true;
  editing = { type: null, id: null };
}

function closeSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.hidden = true;
}

function toggleSidebar() {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeSidebar();
  } else {
    sidebar.classList.add('open');
    overlay.hidden = false;
  }
}

function tourForm(t = {}) {
  return `
    <div class="field">
      <label>Tour name *</label>
      <input name="name" required value="${esc(t.name || '')}" placeholder="e.g. Kerala trip 2026">
    </div>
    <div class="form-grid">
      <div class="field"><label>Start date</label><input name="start" type="date" value="${esc(t.start || '')}"></div>
      <div class="field"><label>End date</label><input name="end" type="date" value="${esc(t.end || '')}"></div>
    </div>
  `;
}

function memberForm(m = {}) {
  return `
    <div class="field">
      <label>Name *</label>
      <input name="name" required value="${esc(m.name || '')}" placeholder="e.g. Rahul">
    </div>
    <div class="field">
      <label>Email or phone</label>
      <input name="contact" value="${esc(m.contact || '')}" placeholder="e.g. rahul@example.com">
    </div>
  `;
}

function expenseForm(e = {}) {
  const tour = getActiveTour();
  if (!tour) return '';

  const selectOptions = tour.members.map(m => `
    <option value="${m.id}" ${m.id === e.paidBy ? 'selected' : ''}>${esc(m.name)}</option>
  `).join('');
  const categoryOptions = expenseCategories.map(category => `
    <option value="${category}" ${(e.category || 'others') === category ? 'selected' : ''}>${category[0].toUpperCase() + category.slice(1)}</option>
  `).join('');

  return `
    <div class="field">
      <label>Description *</label>
      <input name="description" required value="${esc(e.description || '')}" placeholder="e.g. Hotel booking">
    </div>
    <div class="form-grid">
      <div class="field"><label>Amount *</label><input name="amount" required type="number" min="0.01" step="0.01" value="${esc(e.amount || '')}"></div>
      <div class="field"><label>Paid by *</label><select name="paidBy" required>${selectOptions}</select></div>
    </div>
    <div class="field"><label>Category *</label><select name="category" required>${categoryOptions}</select></div>
    <div class="field"><label>Date</label><input name="date" type="date" value="${esc(e.date || new Date().toISOString().slice(0, 10))}"></div>
  `;
}

function showToast(text) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

window.editMember = function(id) {
  const tour = getActiveTour();
  if (!tour) return;
  editing = { type: 'member', id };
  const member = tour.members.find(m => m.id === id) || {};
  openModal('Edit member', memberForm(member));
};

window.deleteMember = function(id) {
  const tour = getActiveTour();
  if (!tour) return;
  if (confirm('Delete this member? Expenses paid by them will remain as Unknown.')) {
    tour.members = tour.members.filter(m => m.id !== id);
    tour.expenses.forEach(e => { if (e.paidBy === id) e.paidBy = 'unknown'; });
    save();
    showToast('Member deleted');
  }
};

window.editExpense = function(id) {
  const tour = getActiveTour();
  if (!tour) return;
  editing = { type: 'expense', id };
  const expense = tour.expenses.find(e => e.id === id) || {};
  openModal('Edit expense', expenseForm(expense));
};

window.deleteExpense = function(id) {
  const tour = getActiveTour();
  if (!tour) return;
  if (confirm('Delete this expense?')) {
    tour.expenses = tour.expenses.filter(e => e.id !== id);
    save();
    showToast('Expense deleted');
  }
};

window.deleteTourConfirm = function(tourId) {
  if (confirm('Delete this tour and all its members and expenses?')) {
    state.tours = state.tours.filter(t => t.id !== tourId);
    if (state.activeTourId === tourId) {
      state.activeTourId = state.tours.length > 0 ? state.tours[0].id : null;
    }
    save();
    showToast('Tour deleted');
  }
};

window.selectTour = function(tourId) {
  state.activeTourId = tourId;
  closeSidebar();
  save();
};

// Event listeners
$('#menuBtn').onclick = toggleSidebar;
$('#closeSidebarBtn').onclick = closeSidebar;
$('#sidebarOverlay').onclick = closeSidebar;

// Tour creation
$('#newTourSidebarBtn').onclick = () => {
  editing = { type: 'tour' };
  openModal('Create a new tour', tourForm());
};

$('#emptyNewTour').onclick = () => {
  editing = { type: 'tour' };
  openModal('Create a new tour', tourForm());
};

$('#editTourBtn').onclick = () => {
  const tour = getActiveTour();
  if (!tour) return;
  editing = { type: 'tour', id: tour.id };
  openModal('Edit tour', tourForm(tour));
};

$('#deleteTourBtn').onclick = () => {
  const tour = getActiveTour();
  if (!tour) return;
  window.deleteTourConfirm(tour.id);
};

$('#addMemberBtn').onclick = () => {
  const tour = getActiveTour();
  if (!tour) return;
  editing = { type: 'member' };
  openModal('Add member', memberForm());
};

$('#addExpenseBtn').onclick = () => {
  const tour = getActiveTour();
  if (!tour) return;
  if (!tour.members.length) return showToast('Add a member first');
  editing = { type: 'expense' };
  openModal('Add expense', expenseForm());
};

$('#closeModal').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('click', e => { if (e.target.id === 'cancelModal') closeModal(); });

// Tour list delegation
document.addEventListener('click', e => {
  if (e.target.closest('.tour-item:not(.tour-item-delete)')) {
    const tourId = e.target.closest('.tour-item').dataset.tourId;
    window.selectTour(tourId);
  }
});

$('#modalForm').onsubmit = e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));

  if (editing.type === 'tour') {
    if (editing.id) {
      const tour = state.tours.find(t => t.id === editing.id);
      if (tour) {
        tour.name = d.name;
        tour.start = d.start;
        tour.end = d.end;
      }
    } else {
      const newTour = {
        id: uid(),
        name: d.name,
        start: d.start,
        end: d.end,
        members: [],
        expenses: []
      };
      state.tours.push(newTour);
      state.activeTourId = newTour.id;
    }
  }

  const tour = getActiveTour();
  if (!tour) {
    save();
    closeModal();
    return showToast('Saved successfully');
  }

  if (editing.type === 'member') {
    if (editing.id) {
      tour.members = tour.members.map(m => m.id === editing.id ? { ...m, ...d } : m);
    } else {
      tour.members.push({ id: uid(), ...d });
    }
  }

  if (editing.type === 'expense') {
    d.amount = Number(d.amount);
    if (editing.id) {
      tour.expenses = tour.expenses.map(x => x.id === editing.id ? { ...x, ...d } : x);
    } else {
      tour.expenses.push({ id: uid(), ...d });
    }
  }

  save();
  closeModal();
  showToast('Saved successfully');
};

document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    $('#expensesTab').hidden = tab.dataset.tab !== 'expenses';
    $('#membersTab').hidden = tab.dataset.tab !== 'members';
  };
});

$('#printBtn').onclick = () => window.print();

// Initialize
render();
