#ifndef REMOVELAYERDIALOG_H
#define REMOVELAYERDIALOG_H

#include <qvariant.h>
#include <qpixmap.h>
#include <qdialog.h>

class QVBoxLayout;
class QHBoxLayout;
class QGridLayout;
class QPushButton;
class QListBox;
class QListBoxItem;
class MapWindow;

class RemoveLayerDialog : public QDialog {
Q_OBJECT

public:
    RemoveLayerDialog( MapWindow* parent );
    ~RemoveLayerDialog();

    QPushButton* buttonRemove;
    QPushButton* buttonClose;
    QListBox* listBox;

protected:
    QVBoxLayout* Layout5;

protected slots:
    virtual void languageChange();
    virtual void remove();

private:
    MapWindow* parentWindow;

};

#endif
