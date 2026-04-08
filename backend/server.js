const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

/* Session Middleware */
app.use(
    session({
        secret: "bankappsecretkey",
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 // 1 hour
        }
    })
);

// 👇 THis is   important LINE
app.use(express.static(path.join(__dirname, "../")));

// 👇 Home route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});


// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.log("Database connection failed:", err);
    } else {
        console.log("Connected to MySQL Database");
    }
});










// ROUTES FOR ADMIN 
/* Admin Login Route */
app.post("/admin/login", async (req, res) => {
    try {

        const { Email, password } = req.body;

        if (!Email || !password) {
            return res.status(400).json({
                message: "Email and Password are required"
            });
        }

        const sql = "SELECT * FROM user_admin WHERE Email=? AND password=?";

        const [result] = await db.promise().query(sql, [Email, password]);

        if (result.length === 0) {
            return res.status(401).json({
                message: "Invalid Email or Password"
            });
        }

        // Save admin data in session
        req.session.admin = {
            id: result[0].id,
            email: result[0].Email,
            name: result[0].Name
        };

        res.status(200).json({
            message: "Admin Login Successful",
            session: req.session.admin
        });

    } catch (error) {

        console.error("Admin Login Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Check Session Route for admin authentication */
app.get("/admin/dashboard", (req, res) => {

    if (!req.session.admin) {
        return res.status(401).json({
            message: "Unauthorized. Please login."
        });
    }

    res.json({
        message: "Welcome to Admin Dashboard",
        admin: req.session.admin
    });

});

/* Add New Bank (Admin Only) */
app.post("/admin/add-bank", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const {
            BankName,
            bank_code,
            bank_password,
            IFSC,
            Bankaddress,
            call_centre_toll_free_no
        } = req.body;

        // Validation
        if (!BankName || !bank_code || !bank_password || !IFSC) {
            return res.status(400).json({
                message: "Required fields missing"
            });
        }

        /* Check if bank already exists */
        const checkSql = `
        SELECT * FROM banks 
        WHERE BankName = ? OR bank_code = ? OR IFSC = ?
        `;

        const [existing] = await db.promise().query(checkSql, [
            BankName,
            bank_code,
            IFSC
        ]);

        if (existing.length > 0) {
            return res.status(409).json({
                message: "This bank already exists"
            });
        }
        const hashedPassword = await bcrypt.hash(bank_password, 10);

        /* Insert new bank */
        const insertSql = `
        INSERT INTO banks
        (BankName, bank_code, bank_password, IFSC, Bankaddress, call_centre_toll_free_no)
        VALUES (?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.promise().query(insertSql, [
            BankName,
            bank_code,
            hashedPassword,
            IFSC,
            Bankaddress,
            call_centre_toll_free_no
        ]);

        res.status(201).json({
            message: "Bank Registered Successfully",
            bank_id: result.insertId
        });

    } catch (error) {

        console.error("Bank Registration Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* List All Banks (Admin Only) */
app.get("/admin/banks", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const sql = "SELECT id, BankName, bank_code, IFSC, Bankaddress, call_centre_toll_free_no, joiningdate FROM banks";

        const [banks] = await db.promise().query(sql);

        if (banks.length === 0) {
            return res.status(404).json({
                message: "No banks found"
            });
        }

        res.status(200).json({
            message: "Banks fetched successfully",
            total_banks: banks.length,
            data: banks
        });

    } catch (error) {

        console.error("Fetch Banks Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Edit Bank Details (Admin Only) */
app.put("/admin/edit-bank/:id", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const bankId = req.params.id;

        const {
            BankName,
            bank_code,
            IFSC,
            Bankaddress,
            call_centre_toll_free_no
        } = req.body;

        // Check if bank exists
        const [bank] = await db.promise().query(
            "SELECT * FROM banks WHERE id = ?",
            [bankId]
        );

        if (bank.length === 0) {
            return res.status(404).json({
                message: "Bank not found"
            });
        }

        // Update bank details
        const sql = `
        UPDATE banks 
        SET BankName=?, bank_code=?, IFSC=?, Bankaddress=?, call_centre_toll_free_no=?
        WHERE id=?
        `;

        await db.promise().query(sql, [
            BankName,
            bank_code,
            IFSC,
            Bankaddress,
            call_centre_toll_free_no,
            bankId
        ]);

        res.status(200).json({
            message: "Bank details updated successfully"
        });

    } catch (error) {

        console.error("Bank Update Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Delete Bank (Admin Only) */
app.delete("/admin/delete-bank/:id", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const bankId = req.params.id;

        // Check if bank exists
        const [bank] = await db.promise().query(
            "SELECT * FROM banks WHERE id = ?",
            [bankId]
        );

        if (bank.length === 0) {
            return res.status(404).json({
                message: "Bank not found"
            });
        }

        // Check if any accounts exist in this bank
        const [accounts] = await db.promise().query(
            "SELECT account_no FROM Accounts WHERE bank_id = ?",
            [bankId]
        );

        if (accounts.length > 0) {
            return res.status(400).json({
                message: "Cannot delete bank. Users/accounts exist in this bank."
            });
        }

        // Delete bank
        await db.promise().query(
            "DELETE FROM banks WHERE id = ?",
            [bankId]
        );

        res.status(200).json({
            message: "Bank deleted successfully"
        });

    } catch (error) {

        console.error("Delete Bank Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Update Bank Code and Password (Admin Only) */
app.put("/admin/update-bank-credentials/:id", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const bankId = req.params.id;
        const { bank_code, bank_password } = req.body;

        if (!bank_code || !bank_password) {
            return res.status(400).json({
                message: "Bank code and password are required"
            });
        }

        // Check if bank exists
        const [bank] = await db.promise().query(
            "SELECT id FROM banks WHERE id = ?",
            [bankId]
        );

        if (bank.length === 0) {
            return res.status(404).json({
                message: "Bank not found"
            });
        }

        // Check if bank_code already exists in another bank
        const [existing] = await db.promise().query(
            "SELECT id FROM banks WHERE bank_code = ? AND id != ?",
            [bank_code, bankId]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "Bank code already in use"
            });
        }
        const hashedPassword = await bcrypt.hash(bank_password, 10);
        // Update bank credentials
        await db.promise().query(
            "UPDATE banks SET bank_code = ?, bank_password = ? WHERE id = ?",
            [bank_code, hashedPassword, bankId]
        );

        res.status(200).json({
            message: "Bank credentials updated successfully"
        });

    } catch (error) {

        console.error("Update Bank Credentials Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Get User Count in Each Bank (Admin Only) */
app.get("/admin/bank-user-count", async (req, res) => {
    try {

        // Check admin session
        if (!req.session.admin) {
            return res.status(401).json({
                message: "Unauthorized. Admin login required"
            });
        }

        const sql = `
        SELECT 
            b.id,
            b.BankName,
            b.bank_code,
            COUNT(a.account_no) AS total_users
        FROM banks b
        LEFT JOIN Accounts a ON b.id = a.bank_id
        GROUP BY b.id, b.BankName, b.bank_code
        ORDER BY b.BankName
        `;

        const [result] = await db.promise().query(sql);

        res.status(200).json({
            message: "Bank user count fetched successfully",
            data: result
        });

    } catch (error) {

        console.error("Fetch Bank User Count Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});





















// ROUTES FOR BANK

/* Bank Login Route */
app.post("/bank/login", async (req, res) => {
    try {

        const { bank_code, bank_password } = req.body;

        if (!bank_code || !bank_password) {
            return res.status(400).json({
                message: "Bank code and password are required"
            });
        }

        const sql = `
        SELECT id, BankName, bank_code, IFSC 
        FROM banks 
        WHERE bank_code = ? AND bank_password = ?
        `;

        const [result] = await db.promise().query(sql, [
            bank_code,
            bank_password
        ]);

        if (result.length === 0) {
            return res.status(401).json({
                message: "Invalid bank code or password"
            });
        }

        // Create bank session
        req.session.bank = {
            id: result[0].id,
            BankName: result[0].BankName,
            bank_code: result[0].bank_code,
            IFSC: result[0].IFSC
        };

        res.status(200).json({
            message: "Bank Login Successful",
            bank: req.session.bank
        });

    } catch (error) {

        console.error("Bank Login Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Get Particular User Details (Bank Only) */
app.get("/bank/user", async (req, res) => {
    try {

        // Check bank session
        if (!req.session.bank) {
            return res.status(401).json({
                message: "Unauthorized. Bank login required"
            });
        }

        const bankId = req.session.bank.id;

        const { account_no, phoneno, Aadhaar_no, name } = req.query;

        if (!account_no && !phoneno && !Aadhaar_no && !name) {
            return res.status(400).json({
                message: "Provide account_no, phoneno, Aadhaar_no, or name"
            });
        }

        const sql = `
        SELECT 
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            account_type,
            balance,
            Address,
            account_opening_date
        FROM Accounts
        WHERE bank_id = ?
        AND (
            account_no = ?
            OR phoneno = ?
            OR Aadhaar_no = ?
            OR name LIKE ?
        )
        LIMIT 50
        `;

        const [users] = await db.promise().query(sql, [
            bankId,
            account_no || null,
            phoneno || null,
            Aadhaar_no || null,
            name ? `%${name}%` : null
        ]);

        if (users.length === 0) {
            return res.status(404).json({
                message: "User not found in this bank"
            });
        }

        res.status(200).json({
            message: "User details fetched successfully",
            total_results: users.length,
            data: users
        });

    } catch (error) {

        console.error("Fetch User Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* List Users in Logged-in Bank with Pagination */
app.get("/bank/users", async (req, res) => {
    try {

        // Check bank session
        if (!req.session.bank) {
            return res.status(401).json({
                message: "Unauthorized. Bank login required"
            });
        }

        const bankId = req.session.bank.id;

        // Offset from query (default = 0)
        const offset = parseInt(req.query.offset) || 0;
        const limit = 50;

        const sql = `
        SELECT 
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            account_type,
            balance,
            account_opening_date
        FROM Accounts
        WHERE bank_id = ?
        ORDER BY account_opening_date DESC
        LIMIT ? OFFSET ?
        `;

        const [users] = await db.promise().query(sql, [bankId, limit, offset]);

        res.status(200).json({
            message: "Users fetched successfully",
            limit: limit,
            offset: offset,
            returned_users: users.length,
            data: users
        });

    } catch (error) {

        console.error("Fetch Bank Users Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Delete User Account (Bank Only) */
app.delete("/bank/delete-user/:account_no", async (req, res) => {
    try {

        // Check bank session
        if (!req.session.bank) {
            return res.status(401).json({
                message: "Unauthorized. Bank login required"
            });
        }

        const bankId = req.session.bank.id;
        const accountNo = req.params.account_no;

        // Check if user exists in this bank
        const [user] = await db.promise().query(
            "SELECT account_no FROM Accounts WHERE account_no = ? AND bank_id = ?",
            [accountNo, bankId]
        );

        if (user.length === 0) {
            return res.status(404).json({
                message: "User not found in this bank"
            });
        }

        // Delete user account
        await db.promise().query(
            "DELETE FROM Accounts WHERE account_no = ? AND bank_id = ?",
            [accountNo, bankId]
        );

        res.status(200).json({
            message: "User account deleted successfully"
        });

    } catch (error) {

        console.error("Delete User Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Get Account Details of a Particular User (Bank Only) */
app.get("/bank/account/:account_no", async (req, res) => {
    try {

        // Check bank session
        if (!req.session.bank) {
            return res.status(401).json({
                message: "Unauthorized. Bank login required"
            });
        }

        const bankId = req.session.bank.id;
        const accountNo = req.params.account_no;

        const sql = `
        SELECT 
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            account_type,
            date_of_birth,
            Address,
            balance,
            BankName,
            IFSC,
            account_opening_date
        FROM Accounts
        WHERE account_no = ? AND bank_id = ?
        `;

        const [user] = await db.promise().query(sql, [accountNo, bankId]);

        if (user.length === 0) {
            return res.status(404).json({
                message: "Account not found in this bank"
            });
        }

        res.status(200).json({
            message: "Account details fetched successfully",
            data: user[0]
        });

    } catch (error) {

        console.error("Fetch Account Details Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});
















//  ROUTES FOR USER


/* User Account Registration */
app.post("/user/register", async (req, res) => {
    try {

        const {
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            acc_password,
            account_type,
            date_of_birth,
            Address,
            IFSC
        } = req.body;

        // Validation
        if (!account_no || !name || !age || !gender || !phoneno || !Aadhaar_no || !Email || !acc_password || !account_type || !date_of_birth || !Address || !IFSC) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }

        // Check bank using IFSC
        const [bank] = await db.promise().query(
            "SELECT id, BankName, IFSC FROM banks WHERE IFSC = ?",
            [IFSC]
        );

        if (bank.length === 0) {
            return res.status(404).json({
                message: "Bank not found"
            });
        }

        const bankId = bank[0].id;
        const BankName = bank[0].BankName;

        // Check duplicate user
        const [existing] = await db.promise().query(
            `SELECT account_no FROM Accounts 
             WHERE account_no=? OR phoneno=? OR Aadhaar_no=? OR Email=?`,
            [account_no, phoneno, Aadhaar_no, Email]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "User already exists with same Account / Phone / Aadhaar / Email"
            });
        }

        // Insert user account
        const sql = `
        INSERT INTO Accounts
        (account_no, name, age, gender, phoneno, Aadhaar_no, Email, acc_password, account_type, date_of_birth, Address, bank_id, BankName, IFSC)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.promise().query(sql, [
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            acc_password,
            account_type,
            date_of_birth,
            Address,
            bankId,
            BankName,
            IFSC
        ]);

        res.status(201).json({
            message: "Account registered successfully"
        });

    } catch (error) {

        console.error("User Registration Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* User Login */
app.post("/user/login", async (req, res) => {
    try {

        const { account_no, phoneno, Email, BankName, acc_password } = req.body;

        // Validation
        if ((!account_no && !phoneno && !Email) || !BankName || !acc_password) {
            return res.status(400).json({
                message: "Provide account_no or phoneno or Email, BankName and password"
            });
        }

        const sql = `
        SELECT 
            account_no,
            name,
            Email,
            phoneno,
            BankName,
            balance
        FROM Accounts
        WHERE 
        (account_no = ? OR phoneno = ? OR Email = ?)
        AND BankName = ?
        AND acc_password = ?
        LIMIT 1
        `;

        const [result] = await db.promise().query(sql, [
            account_no || null,
            phoneno || null,
            Email || null,
            BankName,
            acc_password
        ]);

        if (result.length === 0) {
            return res.status(401).json({
                message: "Invalid login credentials"
            });
        }

        // Create session
        req.session.user = {
            account_no: result[0].account_no,
            name: result[0].name,
            Email: result[0].Email,
            phoneno: result[0].phoneno,
            BankName: result[0].BankName
        };

        res.status(200).json({
            message: "User Login Successful",
            user: req.session.user
        });

    } catch (error) {

        console.error("User Login Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Deposit Money */
app.post("/user/deposit", async (req, res) => {

    const connection = await db.promise().getConnection();

    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const { amount } = req.body;
        const accountNo = req.session.user.account_no;
        const bankName = req.session.user.BankName;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                message: "Invalid deposit amount"
            });
        }

        await connection.beginTransaction();

        // Get current balance
        const [user] = await connection.query(
            "SELECT balance FROM Accounts WHERE account_no = ?",
            [accountNo]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Account not found"
            });
        }

        const newBalance = user[0].balance + amount;

        // Update balance
        await connection.query(
            "UPDATE Accounts SET balance = ? WHERE account_no = ?",
            [newBalance, accountNo]
        );

        // Create transaction id
        const transactionId = Date.now();

        // Insert transaction log
        await connection.query(
            `INSERT INTO Transaction_log 
            (Transaction_id, senders_account_no, senders_bank_name, Amount, total_balance, transaction_type, transaction_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                transactionId,
                accountNo,
                bankName,
                amount,
                newBalance,
                "CREDIT",
                "SUCCESS"
            ]
        );

        await connection.commit();

        res.status(200).json({
            message: "Deposit Successful",
            deposited_amount: amount,
            new_balance: newBalance
        });

    } catch (error) {

        await connection.rollback();

        console.error("Deposit Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    } finally {

        connection.release();

    }

});


/* Withdraw Money */
app.post("/user/withdraw", async (req, res) => {

    const connection = await db.promise().getConnection();

    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const { amount } = req.body;
        const accountNo = req.session.user.account_no;
        const bankName = req.session.user.BankName;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                message: "Invalid withdrawal amount"
            });
        }

        await connection.beginTransaction();

        // Get current balance
        const [user] = await connection.query(
            "SELECT balance FROM Accounts WHERE account_no = ?",
            [accountNo]
        );

        if (user.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Account not found"
            });
        }

        const currentBalance = user[0].balance;

        // Check sufficient balance
        if (currentBalance < amount) {
            await connection.rollback();
            return res.status(400).json({
                message: "Insufficient balance"
            });
        }

        const newBalance = currentBalance - amount;

        // Update balance
        await connection.query(
            "UPDATE Accounts SET balance = ? WHERE account_no = ?",
            [newBalance, accountNo]
        );

        // Generate transaction id
        const transactionId = Date.now();

        // Insert transaction log
        await connection.query(
            `INSERT INTO Transaction_log
            (Transaction_id, senders_account_no, senders_bank_name, Amount, total_balance, transaction_type, transaction_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                transactionId,
                accountNo,
                bankName,
                amount,
                newBalance,
                "DEBIT",
                "SUCCESS"
            ]
        );

        await connection.commit();

        res.status(200).json({
            message: "Withdrawal Successful",
            withdrawn_amount: amount,
            new_balance: newBalance
        });

    } catch (error) {

        await connection.rollback();

        console.error("Withdraw Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    } finally {

        connection.release();

    }

});


/* Check Account Balance */
app.get("/user/balance", async (req, res) => {
    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const accountNo = req.session.user.account_no;

        const sql = `
        SELECT 
            account_no,
            name,
            BankName,
            balance
        FROM Accounts
        WHERE account_no = ?
        LIMIT 1
        `;

        const [result] = await db.promise().query(sql, [accountNo]);

        if (result.length === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.status(200).json({
            message: "Balance fetched successfully",
            account: result[0]
        });

    } catch (error) {

        console.error("Balance Fetch Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Get Logged-in User Account Details */
app.get("/user/account", async (req, res) => {
    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const accountNo = req.session.user.account_no;

        const sql = `
        SELECT 
            account_no,
            name,
            age,
            gender,
            phoneno,
            Aadhaar_no,
            Email,
            account_type,
            date_of_birth,
            Address,
            balance,
            BankName,
            account_opening_date
        FROM Accounts
        WHERE account_no = ?
        LIMIT 1
        `;

        const [result] = await db.promise().query(sql, [accountNo]);

        if (result.length === 0) {
            return res.status(404).json({
                message: "Account not found"
            });
        }

        res.status(200).json({
            message: "Account details fetched successfully",
            account: result[0]
        });

    } catch (error) {

        console.error("Fetch Account Details Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


/* Transfer Money (Account → Account) */
app.post("/user/transfer", async (req, res) => {

    const connection = await db.promise().getConnection();

    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const senderAcc = req.session.user.account_no;
        const senderBank = req.session.user.BankName;

        const { receiver_account_no, amount } = req.body;

        // Validation
        if (!receiver_account_no || !amount || amount <= 0) {
            return res.status(400).json({
                message: "Receiver account and valid amount required"
            });
        }

        if (receiver_account_no == senderAcc) {
            return res.status(400).json({
                message: "Cannot transfer to same account"
            });
        }

        await connection.beginTransaction();

        // Get sender details
        const [sender] = await connection.query(
            "SELECT balance FROM Accounts WHERE account_no = ?",
            [senderAcc]
        );

        if (sender.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Sender account not found"
            });
        }

        const senderBalance = sender[0].balance;

        if (senderBalance < amount) {
            await connection.rollback();
            return res.status(400).json({
                message: "Insufficient balance"
            });
        }

        // Get receiver details
        const [receiver] = await connection.query(
            "SELECT account_no, BankName, balance FROM Accounts WHERE account_no = ?",
            [receiver_account_no]
        );

        if (receiver.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                message: "Receiver account not found"
            });
        }

        const receiverBank = receiver[0].BankName;

        const newSenderBalance = senderBalance - amount;
        const newReceiverBalance = receiver[0].balance + amount;

        // Update sender balance
        await connection.query(
            "UPDATE Accounts SET balance = ? WHERE account_no = ?",
            [newSenderBalance, senderAcc]
        );

        // Update receiver balance
        await connection.query(
            "UPDATE Accounts SET balance = ? WHERE account_no = ?",
            [newReceiverBalance, receiver_account_no]
        );

        const transactionId = Date.now();

        // Sender Transaction (DEBIT)
        await connection.query(
            `INSERT INTO Transaction_log
            (Transaction_id, senders_account_no, senders_bank_name, recievers_account_no, recievers_bank_name, Amount, total_balance, transaction_type, transaction_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                transactionId,
                senderAcc,
                senderBank,
                receiver_account_no,
                receiverBank,
                amount,
                newSenderBalance,
                "DEBIT",
                "SUCCESS"
            ]
        );

        // Receiver Transaction (CREDIT)
        await connection.query(
            `INSERT INTO Transaction_log
            (Transaction_id, senders_account_no, senders_bank_name, recievers_account_no, recievers_bank_name, Amount, total_balance, transaction_type, transaction_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                transactionId + 1,
                receiver_account_no,
                receiverBank,
                senderAcc,
                senderBank,
                amount,
                newReceiverBalance,
                "CREDIT",
                "SUCCESS"
            ]
        );

        await connection.commit();

        res.status(200).json({
            message: "Transfer Successful",
            transferred_amount: amount,
            sender_new_balance: newSenderBalance
        });

    } catch (error) {

        await connection.rollback();

        console.error("Transfer Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    } finally {

        connection.release();

    }

});


/* User Transaction History */
app.get("/user/transactions", async (req, res) => {
    try {

        // Check user session
        if (!req.session.user) {
            return res.status(401).json({
                message: "Unauthorized. User login required"
            });
        }

        const accountNo = req.session.user.account_no;

        const sql = `
        SELECT 
            Transaction_id,
            senders_account_no,
            senders_bank_name,
            recievers_account_no,
            recievers_bank_name,
            Amount,
            total_balance,
            transaction_type,
            transaction_status,
            transaction_time
        FROM Transaction_log
        WHERE senders_account_no = ? 
           OR recievers_account_no = ?
        ORDER BY transaction_time DESC
        `;

        const [transactions] = await db.promise().query(sql, [accountNo, accountNo]);

        if (transactions.length === 0) {
            return res.status(404).json({
                message: "No transactions found"
            });
        }

        res.status(200).json({
            message: "Transaction history fetched successfully",
            total_transactions: transactions.length,
            data: transactions
        });

    } catch (error) {

        console.error("Transaction History Error:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});











/* Common Logout Route */
app.post("/logout", (req, res) => {
    try {

        if (!req.session) {
            return res.status(400).json({
                message: "No active session found"
            });
        }

        req.session.destroy((err) => {

            if (err) {
                console.error("Logout Error:", err);

                return res.status(500).json({
                    message: "Logout Failed"
                });
            }

            res.clearCookie("connect.sid"); // remove session cookie

            res.status(200).json({
                message: "Logout Successful"
            });

        });

    } catch (error) {

        console.error("Logout Exception:", error);

        res.status(500).json({
            message: "Internal Server Error"
        });

    }
});


// Server Start
app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});