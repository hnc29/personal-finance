"""Best-effort Vietnamese-label -> canonical category name lookup.

Money Lover's own category names ("Nhóm") are free-text the user chose
inside Money Lover -- there is no guarantee they match this app's seed
taxonomy (``app.services.default_categories.DEFAULT_CATEGORIES``) at all.
This module ports the *exact* Vietnamese translations already used to
display that taxonomy to the user (``apps/web/lib/i18n.ts``'s
``defaultCategoryLabels``) so a raw Money Lover row whose "Nhóm" happens to
equal one of those translations verbatim (e.g. "Lương" -> "Salary",
"Quần áo" -> "Clothing") can be auto-categorized without guessing.

Keep this in sync with ``defaultCategoryLabels`` in ``apps/web/lib/i18n.ts``
by hand -- there is no shared source between the TypeScript and Python
sides. A raw category name with no entry here (the common case for a real
export, since most Money Lover category names are personal/free-text, e.g.
"Xăng cr", "Ck mẹ") is simply left uncategorized rather than guessed at;
see ``moneylover_apply.py``.
"""

# Vietnamese label (as shown to the user) -> canonical English Category.name.
VI_LABEL_TO_CANONICAL_NAME: dict[str, str] = {
    "Chi tiêu": "Expenses",
    "Thu nhập": "Income",
    "Ăn uống": "Food & Drinks",
    "Đi chợ / Siêu thị": "Groceries",
    "Ăn ngoài": "Eating Out",
    "Cà phê & Đồ uống": "Coffee & Drinks",
    "Hóa đơn & Tiện ích": "Bills & Utilities",
    "Điện": "Electricity",
    "Nước": "Water",
    "Internet": "Internet",
    "Điện thoại di động": "Mobile Phone",
    "Tiền thuê nhà": "Rent",
    "Gas / Khí đốt": "Gas",
    "Di chuyển": "Transportation",
    "Nhiên liệu": "Fuel",
    "Gửi xe": "Parking",
    "Taxi & Xe công nghệ": "Taxi & Ride-hailing",
    "Phương tiện công cộng": "Public Transport",
    "Bảo dưỡng xe": "Vehicle Maintenance",
    "Mua sắm": "Shopping",
    "Quần áo": "Clothing",
    "Điện tử": "Electronics",
    "Đồ dùng cá nhân": "Personal Items",
    "Đồ gia dụng": "Household",
    "Nhà cửa & Gia đình": "Home & Family",
    "Bảo trì nhà cửa": "Home Maintenance",
    "Gia đình": "Family",
    "Con cái": "Children",
    "Thú cưng": "Pets",
    "Sức khỏe": "Health & Fitness",
    "Khám chữa bệnh": "Medical",
    "Thuốc": "Pharmacy",
    "Thể dục": "Fitness",
    "Giải trí": "Entertainment",
    "Phim & Sự kiện": "Movies & Events",
    "Trò chơi": "Games",
    "Dịch vụ đăng ký": "Subscriptions",
    "Sở thích": "Hobbies",
    "Giáo dục": "Education",
    "Học phí": "Tuition",
    "Sách": "Books",
    "Khóa học": "Courses",
    "Du lịch": "Travel",
    "Vé máy bay": "Flights",
    "Lưu trú": "Accommodation",
    "Di chuyển tại điểm đến": "Local Transport",
    "Hoạt động": "Activities",
    "Quà tặng & Từ thiện": "Gifts & Donations",
    "Quà tặng": "Gifts",
    "Từ thiện": "Charity",
    "Bảo hiểm": "Insurance",
    "Thuế & Phí": "Taxes & Fees",
    "Chi tiêu khác": "Other Expense",
    "Lương": "Salary",
    "Thưởng": "Bonus",
    "Thu nhập kinh doanh": "Business Income",
    "Thu nhập đầu tư": "Investment Income",
    "Tiền lãi": "Interest",
    "Quà tặng nhận được": "Gifts Received",
    "Hoàn tiền": "Refunds",
    "Thu nhập khác": "Other Income",
    "Trả nợ": "Debt Repayment",
    "Cho vay": "Loans Given",
    "Đầu tư": "Investments",
    "Tiền mã hóa": "Crypto",
    "Lãi tiền mã hóa": "Crypto Gains",
    "Chi hộ": "Paid on Behalf",
    "Vay & Thu nợ": "Loans & Debt Collection",
    "Thu hộ": "Collected on Behalf",
}
