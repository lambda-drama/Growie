import frappe


def get_context(context):
	context.no_cache = 1
	if frappe.session.user != "Guest":
		context.csrf_token = frappe.sessions.get_csrf_token()
	else:
		context.csrf_token = ""
	return context


