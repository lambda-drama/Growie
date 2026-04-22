import frappe
from frappe.model.document import Document


class GroweMember(Document):
	def before_insert(self):
		if not self.full_name and self.user:
			user_doc = frappe.get_doc("User", self.user)
			self.full_name = user_doc.full_name or f"{user_doc.first_name} {user_doc.last_name}".strip()
