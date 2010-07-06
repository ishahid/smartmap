#ifndef SMINFO_H
#define SMINFO_H

#include <qstring.h>

class SMInfo {
private:
	SMInfo();

public:
	static QString name()		{ return "SmartMap"; }
	static QString title()		{ return "Cosmetic Layer Designer for GIS"; }
	static QString major()		{ return "1"; }
	static QString minor()		{ return "0"; }
	static QString revision()	{ return "3"; }
	static QString build()		{ return "589"; }
	static QString version()	{ return major() + "." + minor() + "." + revision(); }
	static QString longName()	{ return name() + " " + version(); }
	static QString fullName()	{ return name() + " " + version() + " build " + build(); }
	static QString author1()	{ return "Muhammad Imran Shahid"; }
	static QString author2()	{ return "Shahzad Anwar"; }
	static QString company()	{ return "CIT, University of Arid Agriculture Rawalpindi."; }
	static QString description() {
		QString desc = "";
		desc += "<b>" + longName() + "</b><br>";
		desc += title() + "<br>";
		desc += "A project of NDC<br><br>";
		desc += "by:<br>";
		desc += author1() + "<br>";
		desc += author2() + "<br><br>";
		desc += company();
		return desc;
	}
};

#endif
