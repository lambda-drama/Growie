import frappe


@frappe.whitelist(allow_guest=True)
def get_documents_type():
	"""
	Return all Document Type records so the UI can populate the ID-type
	select list on the signup form.

	Each record's `name` (= document_type field) is used as both the
	type_code sent to the server and the label shown to the user.
	"""
	records = frappe.get_all(
		"Document Type",
		fields=["name", "document_type"],
		order_by="creation asc",
	)

	return [
		{"type_code": r.name, "label": r.document_type}
		for r in records
	]
