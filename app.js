const KEY='toursplit-data-v1';
const money = n => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

let state = JSON.parse(localStorage.getItem(KEY) || 'null') || { tour: null, members: [], expenses: [] };
let editing = { type: null, id: null };

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const initials = name => (name || '?').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();

const modal = $('#modal');
const modalForm = $('#modalForm');

function getSummary() {
  const total = state.expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const share = state.members.length ? total / state.members.length : 0;
  const paid = {};

  state.members.forEach(m => { paid[m.id] = 0; });
  state.expenses.forEach(e => {
    if (paid[e.paidBy] !== undefined) {
      paid[e.paidBy] += Number(e.amount || 0);
    }
  });

  const balances = state.members.map(m => ({
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

function render() {
  const active = !!state.tour;
  $('#emptyState').hidden = active;
  $('#dashboard').hidden = !active;

  const summary = getSummary();
  $('#totalSpent').textContent = money(summary.total);
  $('#memberCount').textContent = state.members.length;
  $('#expenseCount').textContent = state.expenses.length;
  $('#averageSpent').textContent = money(summary.share);

  if (!active) return;

  $('#tourTitle').textContent = state.tour.name;
  $('#tourMeta').textContent = `${state.tour.start || 'No start date'}${state.tour.end ? ' → ' + state.tour.end : ''} · ${state.members.length} members`;

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

  $('#expenseList').innerHTML = state.expenses.length ? `<div class="expense-header"><span>Description</span><span>Paid by</span><span>Amount</span><span></span></div>` + state.expenses.map(e => {
    const payer = state.members.find(m => m.id === e.paidBy);
    return `
      <div class="expense-row">
        <span><strong>${esc(e.description)}</strong><small>${e.date || ''}</small></span>
        <span>${esc(payer?.name || 'Unknown')}</span>
        <strong>${money(e.amount)}</strong>
        <span class="row-actions">
          <button type="button" onclick="window.editExpense('${e.id}')">Edit</button>
          <button type="button" onclick="window.deleteExpense('${e.id}')">Delete</button>
        </span>
      </div>
    `;
  }).join('') : '<p class="muted empty-line">No expenses added yet.</p>';

  $('#memberList').innerHTML = state.members.length ? state.members.map(m => `
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

function tourForm(t = {}) {
  return `
    <div class="field">
      <label>Tour name *</label>
      <input name="name" required value="${esc(t.name)}" placeholder="e.g. Kerala trip 2026">
    </div>
    <div class="form-grid">
      <div class="field"><label>Start date</label><input name="start" type="date" value="${esc(t.start)}"></div>
      <div class="field"><label>End date</label><input name="end" type="date" value="${esc(t.end)}"></div>
    </div>
  `;
}

function memberForm(m = {}) {
  return `
    <div class="field">
      <label>Name *</label>
      <input name="name" required value="${esc(m.name)}" placeholder="e.g. Rahul">
    </div>
    <div class="field">
      <label>Email or phone</label>
      <input name="contact" value="${esc(m.contact)}" placeholder="e.g. rahul@example.com">
    </div>
  `;
}

function expenseForm(e = {}) {
  const selectOptions = state.members.map(m => `
    <option value="${m.id}" ${m.id === e.paidBy ? 'selected' : ''}>${esc(m.name)}</option>
  `).join('');

  return `
    <div class="field">
      <label>Description *</label>
      <input name="description" required value="${esc(e.description)}" placeholder="e.g. Hotel booking">
    </div>
    <div class="form-grid">
      <div class="field"><label>Amount *</label><input name="amount" required type="number" min="0.01" step="0.01" value="${esc(e.amount)}"></div>
      <div class="field"><label>Paid by *</label><select name="paidBy" required>${selectOptions}</select></div>
    </div>
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
  editing = { type: 'member', id };
  const member = state.members.find(m => m.id === id) || {};
  openModal('Edit member', memberForm(member));
};

window.deleteMember = function(id) {
  if (confirm('Delete this member? Expenses paid by them will remain as Unknown.')) {
    state.members = state.members.filter(m => m.id !== id);
    state.expenses.forEach(e => { if (e.paidBy === id) e.paidBy = 'unknown'; });
    save();
    showToast('Member deleted');
  }
};

window.editExpense = function(id) {
  editing = { type: 'expense', id };
  const expense = state.expenses.find(e => e.id === id) || {};
  openModal('Edit expense', expenseForm(expense));
};

window.deleteExpense = function(id) {
  if (confirm('Delete this expense?')) {
    state.expenses = state.expenses.filter(e => e.id !== id);
    save();
    showToast('Expense deleted');
  }
};

$('#newTourBtn').onclick = $('#emptyNewTour').onclick = () => {
  editing = { type: 'tour' };
  openModal(state.tour ? 'Edit tour' : 'Create a tour', tourForm(state.tour || {}));
};

$('#editTourBtn').onclick = () => {
  editing = { type: 'tour' };
  openModal('Edit tour', tourForm(state.tour || {}));
};

$('#deleteTourBtn').onclick = () => {
  if (confirm('Delete this tour and all its members and expenses?')) {
    state = { tour: null, members: [], expenses: [] };
    save();
    showToast('Tour deleted');
  }
};

$('#addMemberBtn').onclick = () => {
  editing = { type: 'member' };
  openModal('Add member', memberForm());
};

$('#addExpenseBtn').onclick = () => {
  if (!state.members.length) return showToast('Add a member first');
  editing = { type: 'expense' };
  openModal('Add expense', expenseForm());
};

$('#closeModal').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('click', e => { if (e.target.id === 'cancelModal') closeModal(); });

$('#modalForm').onsubmit = e => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));

  if (editing.type === 'tour') {
    state.tour = { ...(state.tour || {}), ...d };
  }

  if (editing.type === 'member') {
    if (editing.id) {
      state.members = state.members.map(m => m.id === editing.id ? { ...m, ...d } : m);
    } else {
      state.members.push({ id: uid(), ...d });
    }
  }

  if (editing.type === 'expense') {
    d.amount = Number(d.amount);
    if (editing.id) {
      state.expenses = state.expenses.map(x => x.id === editing.id ? { ...x, ...d } : x);
    } else {
      state.expenses.push({ id: uid(), ...d });
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
render();
