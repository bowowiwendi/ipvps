// Sample initial data
let data = [
  { name: "Hamidstore", expiration: "2025-05-17", ip: "165.22.106.236" },
  { name: "biznetid", expiration: "2026-04-10", ip: "103.127.134.151" },
  { name: "Wendi1", expiration: "2026-04-11", ip: "157.230.253.167" },
];

// Function to render the table
function renderTable() {
  const tableBody = document.querySelector("#ipTable tbody");
  tableBody.innerHTML = ""; // Clear existing rows
  data.forEach((entry, index) => {
    const row = `
      <tr>
        <td>${entry.name}</td>
        <td>${entry.expiration}</td>
        <td>${entry.ip}</td>
        <td>
          <button onclick="editEntry(${index})">Edit</button>
          <button onclick="deleteEntry(${index})">Delete</button>
        </td>
      </tr>
    `;
    tableBody.innerHTML += row;
  });
}

// Function to add a new entry
function addEntry() {
  const name = document.getElementById("name").value;
  const expiration = document.getElementById("expiration").value;
  const ip = document.getElementById("ip").value;

  if (name && expiration && ip) {
    data.push({ name, expiration, ip });
    renderTable();
    clearInputs();
  } else {
    alert("Please fill out all fields.");
  }
}

// Function to edit an entry
function editEntry(index) {
  const entry = data[index];
  document.getElementById("name").value = entry.name;
  document.getElementById("expiration").value = entry.expiration;
  document.getElementById("ip").value = entry.ip;

  // Update the Add button to Save
  const addButton = document.querySelector("button[onclick='addEntry()']");
  addButton.innerText = "Save";
  addButton.onclick = () => saveEntry(index);
}

// Function to save edited entry
function saveEntry(index) {
  const name = document.getElementById("name").value;
  const expiration = document.getElementById("expiration").value;
  const ip = document.getElementById("ip").value;

  if (name && expiration && ip) {
    data[index] = { name, expiration, ip };
    renderTable();
    clearInputs();

    // Revert Save button back to Add
    const addButton = document.querySelector("button[onclick='saveEntry()']");
    addButton.innerText = "Add";
    addButton.onclick = addEntry;
  } else {
    alert("Please fill out all fields.");
  }
}

// Function to delete an entry
function deleteEntry(index) {
  if (confirm("Are you sure you want to delete this entry?")) {
    data.splice(index, 1);
    renderTable();
  }
}

// Function to clear input fields
function clearInputs() {
  document.getElementById("name").value = "";
  document.getElementById("expiration").value = "";
  document.getElementById("ip").value = "";
}

// Initial render
renderTable();