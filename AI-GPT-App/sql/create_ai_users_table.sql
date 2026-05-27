CREATE TABLE IF NOT EXISTS `ai_users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `username` VARCHAR(80) NOT NULL UNIQUE,
  `display_name` VARCHAR(180) NOT NULL,
  `employee_id` VARCHAR(80) NOT NULL DEFAULT '',
  `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `password_hash` VARCHAR(128) NOT NULL,
  `password_salt` VARCHAR(64) NOT NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  INDEX `idx_ai_users_username` (`username`),
  INDEX `idx_ai_users_employee_id` (`employee_id`),
  INDEX `idx_ai_users_active` (`active`)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
